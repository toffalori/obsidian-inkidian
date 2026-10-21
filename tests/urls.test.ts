import { beforeAll, describe, expect, it, vi } from "vitest";
import { folderForNewNote, newInInkidianUrl, newNoteName, openInInkidianUrl, waitFor } from "../src/urls";

// The iOS tests (InkidianURLTests.swift) parse exactly these strings.
describe("links to the iPad app", () => {
  it("encodes vault names and paths", () => {
    expect(openInInkidianUrl("Mein Vault", "Mathe Notizen/Übung 1 & Plan+.inkd")).toBe(
      "inkidian://open?vault=Mein%20Vault&path=Mathe%20Notizen%2F%C3%9Cbung%201%20%26%20Plan%2B.inkd",
    );
    expect(newInInkidianUrl("Vault", "Hand writing/Inbox")).toBe("inkidian://new?vault=Vault&folder=Hand%20writing%2FInbox");
    expect(newInInkidianUrl("Vault", "")).toBe("inkidian://new?vault=Vault&folder=");
    expect(newInInkidianUrl("Vault", "Inbox", "Note 2026-10-19 09.05")).toBe("inkidian://new?vault=Vault&folder=Inbox&name=Note%202026-10-19%2009.05");
  });

  it("names a new note as the app does, with a number when it's taken", () => {
    const now = new Date(2026, 9, 19, 9, 5);
    expect(newNoteName(now, () => false)).toBe("Note 2026-10-19 09.05");
    const taken = new Set(["Note 2026-10-19 09.05", "Note 2026-10-19 09.05 2"]);
    expect(newNoteName(now, (name) => taken.has(name))).toBe("Note 2026-10-19 09.05 3");
  });

  it("puts new notes next to the active note, else into the default folder", () => {
    expect(folderForNewNote("Projects/Q4", "Handwriting")).toBe("Projects/Q4");
    expect(folderForNewNote("/", "Handwriting")).toBe("");
    expect(folderForNewNote(null, "Handwriting")).toBe("Handwriting");
    expect(folderForNewNote(null, "/Inbox/")).toBe("Inbox");
    expect(folderForNewNote(null, "")).toBe("");
  });
});

describe("waitFor", () => {
  // Obsidian runs it in a window; the tests run in Node.
  beforeAll(() => vi.stubGlobal("window", globalThis));

  it("returns as soon as the value shows up", async () => {
    let calls = 0;
    const start = Date.now();
    const found = await waitFor(() => (++calls >= 3 ? "note" : null), 2000, 10);
    expect(found).toBe("note");
    expect(Date.now() - start).toBeLessThan(500);
  });

  it("gives up after the timeout", async () => {
    const start = Date.now();
    expect(await waitFor(() => null, 150, 20)).toBeNull();
    expect(Date.now() - start).toBeGreaterThanOrEqual(150);
  });
});
