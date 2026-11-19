// Search in the handwriting of `.inkd` notes (INK-87). The iPad app reads the
// handwriting and keeps the text in each page (SPEC §5.1); Obsidian's own search
// only reads Markdown, so the plugin brings its own.

import { type App, type Plugin, SuggestModal, type TAbstractFile, TFile } from "obsidian";
import { type InkdLine, readHandwriting } from "./inkd";

export interface HandwritingMatch {
  path: string;
  /** From 0. */
  page: number;
  line: InkdLine;
}

/** Ignores case and accents, as the iPad app's search does. */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase();
}

/** Where the query is in `text`, ignoring case and accents: [start, end) in `text`. */
export function matchRange(text: string, query: string): [number, number] | null {
  const folded = fold(query.trim());
  if (!folded) return null;
  // Each folded character remembers the character of `text` it came from.
  let foldedText = "";
  const origin: number[] = [];
  let index = 0;
  for (const character of text) {
    const part = fold(character);
    foldedText += part;
    for (let i = 0; i < part.length; i++) origin.push(index);
    index += character.length;
  }
  const start = foldedText.indexOf(folded);
  if (start < 0) return null;
  const last = origin[start + folded.length - 1];
  return [origin[start], last + String.fromCodePoint(text.codePointAt(last) ?? 0).length];
}

/** The first line with the query in each note, the notes sorted by name. */
export function searchHandwriting(notes: Map<string, InkdLine[][]>, query: string): HandwritingMatch[] {
  if (!fold(query.trim())) return [];
  const matches: HandwritingMatch[] = [];
  for (const [path, pages] of notes) {
    const page = pages.findIndex((lines) => lines.some((line) => matchRange(line.text, query)));
    if (page < 0) continue;
    const line = pages[page].find((line) => matchRange(line.text, query));
    if (line) matches.push({ path, page, line });
  }
  return matches.sort((a, b) => name(a.path).localeCompare(name(b.path), undefined, { numeric: true, sensitivity: "base" }));
}

function name(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.inkd$/i, "");
}

function isNote(file: TAbstractFile): file is TFile {
  return file instanceof TFile && file.extension.toLowerCase() === "inkd";
}

/** The text of every note's handwriting, read on the first search and kept up to date. */
export class HandwritingIndex {
  private notes: Map<string, InkdLine[][]> | null = null;
  private loading: Promise<Map<string, InkdLine[][]>> | null = null;

  constructor(private readonly app: App) {}

  register(plugin: Plugin): void {
    const vault = this.app.vault;
    plugin.registerEvent(vault.on("create", (file) => void this.update(file)));
    plugin.registerEvent(vault.on("modify", (file) => void this.update(file)));
    plugin.registerEvent(vault.on("delete", (file) => this.notes?.delete(file.path)));
    plugin.registerEvent(
      vault.on("rename", (file, oldPath) => {
        this.notes?.delete(oldPath);
        void this.update(file);
      }),
    );
  }

  all(): Promise<Map<string, InkdLine[][]>> {
    this.loading ??= this.load();
    return this.loading;
  }

  private async load(): Promise<Map<string, InkdLine[][]>> {
    // Filled as the notes are read, so changes meanwhile land in it too.
    this.notes = new Map();
    await Promise.all(this.app.vault.getFiles().filter(isNote).map((file) => this.update(file)));
    return this.notes;
  }

  private async update(file: TAbstractFile): Promise<void> {
    if (!this.notes || !isNote(file)) return;
    const pages = readHandwriting(await this.app.vault.cachedRead(file));
    if (pages) this.notes.set(file.path, pages);
    else this.notes.delete(file.path);
  }
}

/** "Search handwritten notes": a result opens its note at the line. */
export class HandwritingSearchModal extends SuggestModal<HandwritingMatch> {
  private query = "";

  constructor(
    app: App,
    private readonly index: HandwritingIndex,
    private readonly onChoose: (match: HandwritingMatch) => void,
  ) {
    super(app);
    this.setPlaceholder("Search handwritten notes");
  }

  async getSuggestions(query: string): Promise<HandwritingMatch[]> {
    this.query = query;
    const notes = await this.index.all();
    const hasText = [...notes.values()].some((pages) => pages.some((lines) => lines.length > 0));
    this.emptyStateText = !hasText
      ? "No handwriting to search yet. Inkidian reads the handwriting in your notes on the iPad and saves the text in them."
      : query.trim()
        ? "No handwriting matches."
        : "Type the words you're looking for.";
    return searchHandwriting(notes, query);
  }

  renderSuggestion(match: HandwritingMatch, el: HTMLElement): void {
    el.addClass("inkidian-search-result");
    el.createDiv({ cls: "inkidian-search-note", text: name(match.path) });
    const line = el.createDiv({ cls: "inkidian-search-line" });
    const range = matchRange(match.line.text, this.query);
    if (range) {
      line.appendText(match.line.text.slice(0, range[0]));
      line.createSpan({ cls: "suggestion-highlight", text: match.line.text.slice(range[0], range[1]) });
      line.appendText(match.line.text.slice(range[1]));
    } else {
      line.setText(match.line.text);
    }
    const folder = match.path.includes("/") ? match.path.slice(0, match.path.lastIndexOf("/")) : "";
    el.createDiv({ cls: "inkidian-search-where", text: folder ? `Page ${match.page + 1} · ${folder}` : `Page ${match.page + 1}` });
  }

  onChooseSuggestion(match: HandwritingMatch): void {
    this.onChoose(match);
  }
}
