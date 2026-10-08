import { readFileSync } from "node:fs";
import { AnnotationMode, getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { describe, expect, it } from "vitest";
import { formatDir } from "./samples";

// The iPad app writes its ink into PDFs as annotations (SPEC §9). Obsidian shows
// PDFs with PDF.js 5.3, so the sample PDF the app wrote is checked with it.
describe("ink in PDFs", () => {
  it("is drawn by Obsidian's PDF viewer", async () => {
    const data = new Uint8Array(readFileSync(formatDir + "samples/app-written.pdf"));
    const pdf = await getDocument({ data }).promise;
    expect(pdf.numPages).toBe(2);

    const page = await pdf.getPage(1);
    const ink = (await page.getAnnotations()).filter((annotation) => annotation.subtype === "Ink");
    expect(ink).toHaveLength(21);
    expect(ink.every((annotation) => annotation.hasAppearance)).toBe(true);

    const operators = await page.getOperatorList({ annotationMode: AnnotationMode.ENABLE });
    expect(operators.fnArray.filter((operator) => operator === OPS.beginAnnotation)).toHaveLength(21);
  });
});
