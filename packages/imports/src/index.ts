import { extname } from "node:path";
import { TextDecoder } from "node:util";
import ExcelJS from "exceljs-hardened";
import { parse as parseCsv } from "csv-parse/sync";

export const IMPORT_MEDIA_TYPES = {
  csv: ["text/csv", "application/csv"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
} as const;

export interface ImportParserLimits {
  maximumFileBytes: number;
  maximumRows: number;
  maximumColumns: number;
  maximumCellCharacters: number;
  maximumWorksheets: number;
  maximumArchiveEntryBytes: number;
  maximumArchiveBytes: number;
}

export const defaultImportParserLimits: ImportParserLimits = {
  maximumFileBytes: 8 * 1024 * 1024,
  maximumRows: 5_000,
  maximumColumns: 64,
  maximumCellCharacters: 1_000,
  maximumWorksheets: 10,
  maximumArchiveEntryBytes: 32 * 1024 * 1024,
  maximumArchiveBytes: 128 * 1024 * 1024,
};

export type ImportFileKind = "csv" | "xlsx";

export interface ImportUpload {
  bytes: Uint8Array;
  declaredMediaType: string;
  originalFilename: string;
}

export interface ValidatedImportUpload extends ImportUpload {
  kind: ImportFileKind;
  normalizedFilename: string;
}

export interface ImportParseIssue {
  code: string;
  column?: string;
  message: string;
}

export interface ParsedImportRow {
  rowNumber: number;
  values: Record<string, string | number>;
  parserIssues: ImportParseIssue[];
}

export interface ParsedImportFile {
  headers: string[];
  rows: ParsedImportRow[];
  suggestedMapping: Partial<Record<ImportSemanticField, string>>;
  worksheetName: string | null;
}

export const IMPORT_SEMANTIC_FIELDS = [
  "displayName",
  "contactName",
  "phoneNumber",
  "phoneCountry",
  "invitationType",
  "maxCompanions",
  "members",
  "internalNote",
] as const;

export type ImportSemanticField = (typeof IMPORT_SEMANTIC_FIELDS)[number];

export class ImportFileError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ImportFileError";
  }
}

export function validateImportUpload(
  upload: ImportUpload,
  limits: ImportParserLimits = defaultImportParserLimits,
): ValidatedImportUpload {
  const normalizedFilename = validateFilename(upload.originalFilename);
  if (upload.bytes.byteLength === 0) {
    throw new ImportFileError("IMPORT_FILE_EMPTY", "The import file is empty.");
  }
  if (upload.bytes.byteLength > limits.maximumFileBytes) {
    throw new ImportFileError(
      "IMPORT_FILE_TOO_LARGE",
      `The import file cannot exceed ${limits.maximumFileBytes} bytes.`,
    );
  }

  const extension = extname(normalizedFilename).toLocaleLowerCase("en");
  const mediaType = upload.declaredMediaType
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (extension === ".xlsx") {
    if (
      !mediaType ||
      !(IMPORT_MEDIA_TYPES.xlsx as readonly string[]).includes(mediaType)
    ) {
      throw new ImportFileError(
        "IMPORT_MEDIA_TYPE_MISMATCH",
        "The file extension and declared spreadsheet media type do not match.",
      );
    }
    if (!hasZipSignature(upload.bytes)) {
      throw new ImportFileError(
        "IMPORT_CONTENT_TYPE_MISMATCH",
        "The uploaded file is not an XLSX archive.",
      );
    }
    return { ...upload, kind: "xlsx", normalizedFilename };
  }

  if (extension === ".csv") {
    if (
      !mediaType ||
      !(IMPORT_MEDIA_TYPES.csv as readonly string[]).includes(mediaType)
    ) {
      throw new ImportFileError(
        "IMPORT_MEDIA_TYPE_MISMATCH",
        "The file extension and declared CSV media type do not match.",
      );
    }
    decodeUtf8(upload.bytes);
    return { ...upload, kind: "csv", normalizedFilename };
  }

  throw new ImportFileError(
    "IMPORT_EXTENSION_UNSUPPORTED",
    "Only .xlsx and .csv guest lists are supported.",
  );
}

export async function parseImportFile(
  upload: ValidatedImportUpload,
  limits: ImportParserLimits = defaultImportParserLimits,
): Promise<ParsedImportFile> {
  return upload.kind === "xlsx"
    ? parseXlsx(upload.bytes, limits)
    : parseCsvFile(upload.bytes, limits);
}

function parseCsvFile(
  bytes: Uint8Array,
  limits: ImportParserLimits,
): ParsedImportFile {
  const text = decodeUtf8(bytes);
  let records: unknown[][];
  try {
    records = parseCsv(text, {
      bom: true,
      columns: false,
      delimiter: ",",
      max_record_size: limits.maximumColumns * limits.maximumCellCharacters,
      relax_column_count: false,
      skip_empty_lines: true,
      to: limits.maximumRows + 2,
      trim: false,
    }) as unknown[][];
  } catch {
    throw new ImportFileError(
      "CSV_MALFORMED",
      "The CSV structure is malformed or exceeds parser limits.",
    );
  }
  return rowsToParsedFile(records, limits, null);
}

async function parseXlsx(
  bytes: Uint8Array,
  limits: ImportParserLimits,
): Promise<ParsedImportFile> {
  const workbook = new ExcelJS.Workbook();
  try {
    const archive = Uint8Array.from(bytes).buffer;
    await workbook.xlsx.load(archive, {
      ignoreNodes: [
        "dataValidations",
        "extLst",
        "headerFooter",
        "hyperlinks",
        "picture",
        "sheetPr",
      ],
      maxEntryUncompressedSize: limits.maximumArchiveEntryBytes,
      maxTotalUncompressedSize: limits.maximumArchiveBytes,
    } as Parameters<typeof workbook.xlsx.load>[1]);
  } catch {
    throw new ImportFileError(
      "XLSX_MALFORMED",
      "The XLSX workbook is malformed, encrypted, or exceeds archive safety limits.",
    );
  }

  if (workbook.worksheets.length > limits.maximumWorksheets) {
    throw new ImportFileError(
      "WORKSHEET_LIMIT_EXCEEDED",
      `The workbook cannot contain more than ${limits.maximumWorksheets} worksheets.`,
    );
  }
  const worksheet = workbook.worksheets.find(
    (candidate) => candidate.actualRowCount > 0,
  );
  if (!worksheet) {
    throw new ImportFileError(
      "IMPORT_FILE_EMPTY",
      "The workbook has no data rows.",
    );
  }
  if (worksheet.actualColumnCount > limits.maximumColumns) {
    throw new ImportFileError(
      "COLUMN_LIMIT_EXCEEDED",
      `The worksheet cannot contain more than ${limits.maximumColumns} columns.`,
    );
  }
  if (worksheet.actualRowCount > limits.maximumRows + 1) {
    throw new ImportFileError(
      "ROW_LIMIT_EXCEEDED",
      `The worksheet cannot contain more than ${limits.maximumRows} data rows.`,
    );
  }

  const matrix: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const values: unknown[] = [];
    for (let column = 1; column <= worksheet.actualColumnCount; column += 1) {
      values.push(row.getCell(column).value);
    }
    matrix.push(values);
  });
  return rowsToParsedFile(matrix, limits, worksheet.name);
}

function rowsToParsedFile(
  matrix: readonly unknown[][],
  limits: ImportParserLimits,
  worksheetName: string | null,
): ParsedImportFile {
  const [rawHeaders, ...rawRows] = matrix;
  if (!rawHeaders) {
    throw new ImportFileError(
      "IMPORT_FILE_EMPTY",
      "The import file has no header row.",
    );
  }
  if (rawHeaders.length > limits.maximumColumns) {
    throw new ImportFileError(
      "COLUMN_LIMIT_EXCEEDED",
      `The import cannot contain more than ${limits.maximumColumns} columns.`,
    );
  }
  if (rawRows.length > limits.maximumRows) {
    throw new ImportFileError(
      "ROW_LIMIT_EXCEEDED",
      `The import cannot contain more than ${limits.maximumRows} data rows.`,
    );
  }

  const headers = rawHeaders.map((value, index) =>
    normalizeHeader(value, index, limits.maximumCellCharacters),
  );
  if (
    new Set(headers.map((header) => header.toLocaleLowerCase("en"))).size !==
    headers.length
  ) {
    throw new ImportFileError(
      "DUPLICATE_HEADERS",
      "Every spreadsheet column must have a unique header.",
    );
  }

  const rows = rawRows.map((rawRow, rowIndex): ParsedImportRow => {
    const values: Record<string, string | number> = {};
    const parserIssues: ImportParseIssue[] = [];
    headers.forEach((header, columnIndex) => {
      const rawValue = rawRow[columnIndex];
      if (rawValue === null || rawValue === undefined || rawValue === "")
        return;
      const parsed = plainCellValue(rawValue, limits.maximumCellCharacters);
      if (parsed.issue) {
        parserIssues.push({ ...parsed.issue, column: header });
      } else if (parsed.value !== undefined) {
        values[header] = parsed.value;
      }
    });
    return { rowNumber: rowIndex + 2, values, parserIssues };
  });

  return {
    headers,
    rows,
    suggestedMapping: suggestColumnMapping(headers),
    worksheetName,
  };
}

function normalizeHeader(
  value: unknown,
  index: number,
  maximumCharacters: number,
): string {
  const parsed = plainCellValue(value, maximumCharacters);
  if (parsed.issue || parsed.value === undefined) {
    throw new ImportFileError(
      "HEADER_INVALID",
      `Column ${index + 1} must have a plain-text header.`,
    );
  }
  const header = String(parsed.value).trim();
  if (!header) {
    throw new ImportFileError(
      "HEADER_INVALID",
      `Column ${index + 1} must have a non-empty header.`,
    );
  }
  return header;
}

function plainCellValue(
  value: unknown,
  maximumCharacters: number,
): { value?: string | number; issue?: ImportParseIssue } {
  if (typeof value === "string") {
    if (value.length > maximumCharacters) {
      return {
        issue: {
          code: "CELL_TOO_LONG",
          message: `Cell text cannot exceed ${maximumCharacters} characters.`,
        },
      };
    }
    return { value: value.trim() };
  }
  if (typeof value === "number" && Number.isFinite(value)) return { value };
  if (value instanceof Date) return { value: value.toISOString() };
  if (typeof value === "boolean") return { value: value ? "true" : "false" };
  return {
    issue: {
      code: "ACTIVE_OR_COMPLEX_CELL_REJECTED",
      message:
        "Formulas, hyperlinks, rich text, errors, and embedded content are not imported.",
    },
  };
}

function suggestColumnMapping(
  headers: readonly string[],
): Partial<Record<ImportSemanticField, string>> {
  const aliases: Record<ImportSemanticField, readonly string[]> = {
    displayName: [
      "display name",
      "guest",
      "guest name",
      "name",
      "اسم الضيف",
      "الاسم",
    ],
    contactName: ["contact", "contact name", "اسم جهة الاتصال", "جهة الاتصال"],
    phoneNumber: [
      "phone",
      "phone number",
      "mobile",
      "whatsapp",
      "رقم الجوال",
      "رقم الهاتف",
      "واتساب",
    ],
    phoneCountry: ["country", "country code", "الدولة", "رمز الدولة"],
    invitationType: ["type", "invitation type", "نوع الدعوة"],
    maxCompanions: [
      "companions",
      "max companions",
      "المرافقون",
      "عدد المرافقين",
    ],
    members: [
      "members",
      "family members",
      "named members",
      "أفراد العائلة",
      "الأفراد",
    ],
    internalNote: ["note", "internal note", "ملاحظة", "ملاحظة داخلية"],
  };
  const result: Partial<Record<ImportSemanticField, string>> = {};
  for (const field of IMPORT_SEMANTIC_FIELDS) {
    const match = headers.find((header) =>
      aliases[field].includes(header.trim().toLocaleLowerCase("en")),
    );
    if (match) result[field] = match;
  }
  return result;
}

function validateFilename(value: string): string {
  const filename = value.normalize("NFC").trim();
  if (
    filename.length === 0 ||
    filename.length > 255 ||
    filename.includes("/") ||
    filename.includes("\\") ||
    [...filename].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint <= 0x1f ||
        (codePoint >= 0x7f && codePoint <= 0x9f) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069)
      );
    }) ||
    filename === "." ||
    filename === ".."
  ) {
    throw new ImportFileError(
      "IMPORT_FILENAME_INVALID",
      "The original filename is invalid.",
    );
  }
  return filename;
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error("NUL byte");
    return text;
  } catch {
    throw new ImportFileError(
      "CSV_ENCODING_INVALID",
      "CSV files must be valid UTF-8 text without binary content.",
    );
  }
}

function hasZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.byteLength >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
      (bytes[2] === 0x05 && bytes[3] === 0x06) ||
      (bytes[2] === 0x07 && bytes[3] === 0x08))
  );
}
