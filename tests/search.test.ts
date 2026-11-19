import { describe, expect, it, vi } from "vitest";
import { readHandwriting, type InkdLine } from "../src/inkd";
import { fold, HandwritingIndex, matchRange, searchHandwriting } from "../src/search";
import { readSample, readSampleJson } from "./samples";

vi.mock("obsidian", () => ({
  SuggestModal: class {},
  TFile: class {
    constructor(
      public path: string,
      public extension: string,
    ) {}
  },
}));

const line = (text: string): InkdLine => ({ text, box: [0, 0, 100, 20] });

describe("readHandwriting", () => {
  it("reads the lines of each page", () => {
    expect(readHandwriting(readSample("lined-handwriting.inkd"))).toEqual([[{ text: "Lined paper with handwriting", box: [80, 70, 560, 40] }]]);
  });

  it("gives pages not read yet no lines", () => {
    expect(readHandwriting(readSample("multipage.inkd"))).toEqual(readSampleJson("multipage.inkd").pages.map(() => []));
  });

  it("skips damaged lines and files that aren't notes", () => {
    const doc = readSampleJson("minimal.inkd") as unknown as { pages: Record<string, unknown>[] };
    doc.pages[0].handwriting = { source: "x", lines: [{ text: "ok", box: [1, 2, 3, 4] }, { text: "no box" }, { text: 3, box: [1, 2, 3, 4] }] };
    expect(readHandwriting(JSON.stringify(doc))).toEqual([[{ text: "ok", box: [1, 2, 3, 4] }]]);
    doc.pages[0].handwriting = "broken";
    expect(readHandwriting(JSON.stringify(doc))).toEqual([[]]);
    expect(readHandwriting("not json")).toBeNull();
    expect(readHandwriting('{"format":"other","pages":[]}')).toBeNull();
  });
});

describe("search", () => {
  it("ignores case and accents", () => {
    expect(fold("Prüfung ÜBER Café")).toBe("prufung uber cafe");
    expect(matchRange("Die Prüfung morgen", "PRUFUNG")).toEqual([4, 11]);
    expect(matchRange("Die Prüfung morgen", "prüfung")).toEqual([4, 12]);
    expect(matchRange("Spacing beats cramming", "  ")).toBeNull();
    expect(matchRange("Spacing beats cramming", "sleep")).toBeNull();
  });

  it("finds the first matching line of each note, notes by name", () => {
    const notes = new Map([
      ["Lectures/Lecture 10.inkd", [[line("Memory and sleep")]]],
      ["Lectures/Lecture 4.inkd", [[line("How memory works")], [line("Spacing beats cramming"), line("Cramming again")]]],
      ["Other.inkd", [[line("Groceries")]]],
    ]);
    const matches = searchHandwriting(notes, "cramming");
    expect(matches).toEqual([{ path: "Lectures/Lecture 4.inkd", page: 1, line: line("Spacing beats cramming") }]);
    expect(searchHandwriting(notes, "MEMORY").map((match) => match.path)).toEqual(["Lectures/Lecture 4.inkd", "Lectures/Lecture 10.inkd"]);
    expect(searchHandwriting(notes, "")).toEqual([]);
  });
});

describe("HandwritingIndex", () => {
  it("reads every note once and follows changes", async () => {
    const { TFile } = (await import("obsidian")) as unknown as { TFile: new (path: string, extension: string) => { path: string } };
    const files = new Map<string, string>([
      ["A.inkd", readSample("lined-handwriting.inkd")],
      ["B.inkd", readSample("minimal.inkd")],
      ["Daily.md", "# Daily"],
    ]);
    const handlers = new Map<string, (...args: unknown[]) => void>();
    const reads: string[] = [];
    const app = {
      vault: {
        getFiles: () => [...files.keys()].map((path) => new TFile(path, path.split(".").pop() ?? "")),
        cachedRead: async (file: { path: string }) => {
          reads.push(file.path);
          return files.get(file.path) ?? "";
        },
        on: (name: string, handler: (...args: unknown[]) => void) => handlers.set(name, handler),
      },
    };
    const index = new HandwritingIndex(app as never);
    index.register({ registerEvent: () => undefined } as never);

    const notes = await index.all();
    expect([...notes.keys()].sort()).toEqual(["A.inkd", "B.inkd"]);
    expect(await index.all()).toBe(notes);
    expect(reads.sort()).toEqual(["A.inkd", "B.inkd"]);

    files.set("B.inkd", readSample("lined-handwriting.inkd"));
    handlers.get("modify")?.(new TFile("B.inkd", "inkd"));
    await vi.waitFor(() => expect(searchHandwriting(notes, "lined").length).toBe(2));

    files.set("C.inkd", files.get("A.inkd") ?? "");
    handlers.get("rename")?.(new TFile("C.inkd", "inkd"), "A.inkd");
    handlers.get("delete")?.(new TFile("B.inkd", "inkd"));
    await vi.waitFor(() => expect([...notes.keys()]).toEqual(["C.inkd"]));
  });
});
