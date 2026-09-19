import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs-hardened";
import { describe, expect, it } from "vitest";
import { parseImportFile, validateImportUpload } from "./index";

const root = new URL("../../../apps/web/public/templates/", import.meta.url);
const expected = {
  displayName: "Guest name",
  contactName: "Contact name",
  phoneNumber: "Phone number",
  phoneCountry: "Country code",
  invitationType: "Invitation type",
  maxCompanions: "Max companions",
  members: "Named members",
  internalNote: "Internal note",
};
describe("downloadable guest templates", () => {
  it("round trips a filled Excel template through the real importer", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      Uint8Array.from(await readFile(new URL("guest-import.xlsx", root)))
        .buffer,
    );
    const sheet = workbook.worksheets[0]!;
    expect(sheet.name).toBe("Guests");
    expect(sheet.getCell("C2").numFmt).toBe("@");
    expect(sheet.getRow(2).values.filter(Boolean)).toHaveLength(0);
    sheet.getRow(2).values = [
      "أحمد",
      "",
      "0501234567",
      "SA",
      "single",
      0,
      "",
      "",
    ];
    const bytes = await workbook.xlsx.writeBuffer();
    const parsed = await parseImportFile(
      validateImportUpload({
        bytes: new Uint8Array(bytes),
        declaredMediaType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        originalFilename: "guests.xlsx",
      }),
    );
    expect(parsed.suggestedMapping).toEqual(expected);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.values["Phone number"]).toBe("0501234567");
    expect(parsed.rows[0]!.parserIssues).toEqual([]);
  });
  it("round trips a filled UTF-8 CSV template without importing instructions", async () => {
    const template = await readFile(new URL("guest-import.csv", root), "utf8");
    const parsed = await parseImportFile(
      validateImportUpload({
        bytes: Buffer.from(template + "أحمد,,0501234567,SA,single,0,,\r\n"),
        declaredMediaType: "text/csv",
        originalFilename: "guests.csv",
      }),
    );
    expect(parsed.suggestedMapping).toEqual(expected);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!.parserIssues).toEqual([]);
  });
});
