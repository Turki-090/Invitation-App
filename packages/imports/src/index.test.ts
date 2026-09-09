import ExcelJS from "exceljs-hardened";
import { describe, expect, it } from "vitest";
import {
  defaultImportParserLimits,
  ImportFileError,
  parseImportFile,
  validateImportUpload,
} from "./index";

const encoder = new TextEncoder();

describe("secure import parsing", () => {
  it("validates and parses UTF-8 CSV with Arabic headers", async () => {
    const upload = validateImportUpload({
      bytes: encoder.encode(
        "الاسم,رقم الجوال,نوع الدعوة,الأفراد\nعائلة الدوسري,0501234567,عائلة,عبدالله|منيرة\n",
      ),
      declaredMediaType: "text/csv; charset=utf-8",
      originalFilename: "قائمة الضيوف.csv",
    });
    const parsed = await parseImportFile(upload);
    expect(parsed).toMatchObject({
      worksheetName: null,
      suggestedMapping: {
        displayName: "الاسم",
        phoneNumber: "رقم الجوال",
        invitationType: "نوع الدعوة",
        members: "الأفراد",
      },
      rows: [
        {
          rowNumber: 2,
          values: {
            الاسم: "عائلة الدوسري",
            "رقم الجوال": "0501234567",
            "نوع الدعوة": "عائلة",
            الأفراد: "عبدالله|منيرة",
          },
          parserIssues: [],
        },
      ],
    });
  });

  it("loads XLSX data but rejects formula cells as active content", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Guests");
    sheet.addRow(["Guest", "Phone"]);
    sheet.addRow(["Sarah", "0501234567"]);
    sheet.addRow([{ formula: "1+1", result: 2 }, "0507654321"]);
    const bytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    const parsed = await parseImportFile(
      validateImportUpload({
        bytes,
        declaredMediaType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        originalFilename: "guests.xlsx",
      }),
    );
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[1]?.parserIssues).toContainEqual(
      expect.objectContaining({ code: "ACTIVE_OR_COMPLEX_CELL_REJECTED" }),
    );
  });

  it("rejects extension, MIME, signature, path, and UTF-8 mismatches", () => {
    const attempts = [
      () =>
        validateImportUpload({
          bytes: encoder.encode("a,b\n1,2"),
          declaredMediaType: "text/csv",
          originalFilename: "../guests.csv",
        }),
      () =>
        validateImportUpload({
          bytes: encoder.encode("a,b\n1,2"),
          declaredMediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          originalFilename: "guests.csv",
        }),
      () =>
        validateImportUpload({
          bytes: encoder.encode("not a zip"),
          declaredMediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          originalFilename: "guests.xlsx",
        }),
      () =>
        validateImportUpload({
          bytes: new Uint8Array([0xff, 0xfe, 0x00]),
          declaredMediaType: "text/csv",
          originalFilename: "guests.csv",
        }),
      () =>
        validateImportUpload({
          bytes: encoder.encode("a,b\n1,2"),
          declaredMediaType: "text/csv",
          originalFilename: "guests\u202Efdp.csv",
        }),
    ];
    for (const attempt of attempts) expect(attempt).toThrow(ImportFileError);
  });

  it("enforces file, row, column, and cell limits", async () => {
    expect(() =>
      validateImportUpload(
        {
          bytes: encoder.encode("header\nvalue"),
          declaredMediaType: "text/csv",
          originalFilename: "guests.csv",
        },
        { ...defaultImportParserLimits, maximumFileBytes: 4 },
      ),
    ).toThrowError(expect.objectContaining({ code: "IMPORT_FILE_TOO_LARGE" }));

    const upload = validateImportUpload({
      bytes: encoder.encode("name,phone\na,1\nb,2"),
      declaredMediaType: "text/csv",
      originalFilename: "guests.csv",
    });
    await expect(
      parseImportFile(upload, {
        ...defaultImportParserLimits,
        maximumRows: 1,
      }),
    ).rejects.toMatchObject({ code: "ROW_LIMIT_EXCEEDED" });

    const tooManyColumns = validateImportUpload({
      bytes: encoder.encode("one,two,three\n1,2,3"),
      declaredMediaType: "text/csv",
      originalFilename: "columns.csv",
    });
    await expect(
      parseImportFile(tooManyColumns, {
        ...defaultImportParserLimits,
        maximumColumns: 2,
      }),
    ).rejects.toMatchObject({ code: "COLUMN_LIMIT_EXCEEDED" });

    const longCell = validateImportUpload({
      bytes: encoder.encode("name\nlong value"),
      declaredMediaType: "text/csv",
      originalFilename: "cells.csv",
    });
    await expect(
      parseImportFile(longCell, {
        ...defaultImportParserLimits,
        maximumCellCharacters: 4,
      }),
    ).resolves.toMatchObject({
      rows: [
        {
          parserIssues: [expect.objectContaining({ code: "CELL_TOO_LONG" })],
        },
      ],
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Guests");
    sheet.addRow(["Name"]);
    sheet.addRow(["One"]);
    sheet.addRow(["Two"]);
    const workbookBytes = new Uint8Array(await workbook.xlsx.writeBuffer());
    await expect(
      parseImportFile(
        validateImportUpload({
          bytes: workbookBytes,
          declaredMediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          originalFilename: "rows.xlsx",
        }),
        { ...defaultImportParserLimits, maximumRows: 1 },
      ),
    ).rejects.toMatchObject({ code: "ROW_LIMIT_EXCEEDED" });
  });

  it("rejects malformed CSV and duplicate headers", async () => {
    for (const text of ['name,phone\n"unterminated,123', "name,Name\na,b"]) {
      const upload = validateImportUpload({
        bytes: encoder.encode(text),
        declaredMediaType: "text/csv",
        originalFilename: "guests.csv",
      });
      await expect(parseImportFile(upload)).rejects.toBeInstanceOf(
        ImportFileError,
      );
    }
  });
});
