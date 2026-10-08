import { FileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { addHeaderAction, appButton } from "./actions";
import { parseInkd } from "./inkd";
import type InkidianPlugin from "./main";
import { isIPad } from "./platform";
import { renderPage } from "./render";
import { toDom } from "./svg";
import { openInInkidianUrl } from "./urls";

export const VIEW_TYPE_INKD = "inkidian";

let viewCount = 0;

/** Read-only preview of an `.inkd` note (PLAN §6.2). */
export class InkdView extends FileView {
  private renderedText: string | null = null;
  private readonly idPrefix = `inkidian-${++viewCount}`;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: InkidianPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_INKD;
  }

  getDisplayText(): string {
    return this.file?.basename ?? "Inkidian";
  }

  getIcon(): string {
    return "inkidian";
  }

  canAcceptExtension(extension: string): boolean {
    return extension === "inkd";
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("inkidian-view");
    addHeaderAction(this, "Edit in Inkidian", () => {
      if (this.file) this.plugin.editInInkidian(this.file);
    });
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file === this.file) void this.refresh();
      }),
    );
    // Obsidian may not notice a file the iPad app wrote while Obsidian was in the
    // background, so check again whenever it comes back.
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible") void this.refresh();
    });
    this.registerDomEvent(window, "focus", () => void this.refresh());
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.renderedText = null;
    await this.refresh();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.renderedText = null;
    this.contentEl.empty();
  }

  /** Renders again with the current settings. */
  rerender(): void {
    this.renderedText = null;
    void this.refresh();
  }

  /** Reads the file from disk and renders it if it changed. */
  private async refresh(): Promise<void> {
    const file = this.file;
    if (!file) return;
    let text: string;
    try {
      text = await this.app.vault.adapter.read(file.path);
    } catch {
      return; // Deleted or moved: Obsidian closes or retargets the view.
    }
    if (text === this.renderedText || file !== this.file) return;
    this.renderedText = text;
    this.render(text);
  }

  private render(text: string): void {
    const result = parseInkd(text);
    this.contentEl.empty();
    this.contentEl.toggleClass("inkidian-invert", this.plugin.settings.darkMode === "invert");
    if (!result.ok) {
      this.contentEl.createDiv({ cls: "inkidian-message", text: result.message });
      return;
    }
    if (isIPad()) {
      // The nib in the top right corner, visible while the pages scroll (D18).
      const bar = this.contentEl.createDiv({ cls: "inkidian-edit-bar" });
      appButton(bar, "Edit in Inkidian", openInInkidianUrl(this.app.vault.getName(), this.file?.path ?? ""));
    }
    const pages = this.contentEl.createDiv({ cls: "inkidian-pages" });
    result.document.pages.forEach((page, index) => {
      pages.appendChild(toDom(renderPage(page, result.document, index, this.idPrefix)));
    });
  }
}
