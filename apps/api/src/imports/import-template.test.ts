import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseImportFile, validateImportUpload } from "@dawah/imports";
import { validateImportRow, type ImportColumnMapping } from "@dawah/domain";
import { expect, it } from "vitest";

it("validates all three invitation types filled into the downloadable template", async () => {
  const template = await readFile(
    resolve(__dirname, "../../../web/public/templates/guest-import.csv"),
    "utf8",
  );
  const parsed = await parseImportFile(
    validateImportUpload({
      originalFilename: "guests.csv",
      declaredMediaType: "text/csv",
      bytes: Buffer.from(
        template +
          [
            "أحمد,,0501234567,SA,single,0,,",
            "عائلة محمد,محمد,+966551234567,SA,named_group,0,محمد|فاطمة,",
            "خالد,,0561234567,SA,primary_with_companions,2,,",
          ].join("\r\n"),
      ),
    }),
  );
  expect(parsed.rows).toHaveLength(3);
  for (const row of parsed.rows) {
    expect(row.parserIssues).toEqual([]);
    const validated = validateImportRow(
      row.values,
      parsed.suggestedMapping as ImportColumnMapping,
    );
    expect(validated.errors).toEqual([]);
    expect(validated.normalized?.phoneE164).toMatch(/^\+9665\d{8}$/);
  }
});
