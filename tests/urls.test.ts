import { beforeAll, describe, expect, it, vi } from "vitest";
import { folderForNewNote, newInInkidianUrl, openInInkidianUrl, waitFor } from "../src/urls";

// The iOS tests (InkidianURLTests.swift) parse exactly these strings.
describe("links to the iPad app", () => {
  it("encodes vault names and paths", () => {
    expect(openInInkidianUrl("Mein Vault", "Mathe Notizen/Übung 1 & Plan+.inkd")).toBe(
      "inkidian://open?vault=Mein%20Vault&path=Mathe%20Notizen%2F%C3%9Cbung%201%20%26%20Plan%2B.inkd",
    );
    expect(newInInkidianUrl("Vault", "Hand writing/Inbox")).toBe("inkidian://new?vault=Vault&folder=Hand%20writing%2FInbox");
    expect(newInInkidianUrl("Vault", "")).toBe("inkidian://new?vault=Vault&folder=");
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
