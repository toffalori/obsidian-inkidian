import { Component, type TFile } from "obsidian";
import { appButton } from "./actions";
import { parseInkd } from "./inkd";
import { LiveNotes } from "./live";
import type InkidianPlugin from "./main";
import { isIPad, noticeChange } from "./platform";
import { renderEmbed } from "./render";
import { toDom } from "./svg";
import { openInInkidianUrl } from "./urls";

/**
 * `![[Note.inkd]]` in Markdown notes, Canvas and hover previews. Obsidian creates
 * one per embed through its (unofficial) embed registry, then calls `loadFile`
 * (docs/embedding.md).
 */
export class InkdEmbed extends Component {
  private static count = 0;
  private readonly idPrefix = `inkidian-embed-${++InkdEmbed.count}`;
  private renderedText: string | null = null;
  /** The file's modification time and size at the last check. */
  private checkedStat = "";

  constructor(
    private readonly plugin: InkidianPlugin,
    private readonly containerEl: HTMLElement,
    private readonly file: TFile,
  ) {
    super();
  }

  onload(): void {
    this.containerEl.addClass("inkidian-embed");
    this.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (file === this.file) void this.render();
      }),
    );
    // As in InkdView: a change Obsidian Sync downloads while Obsidian isn't
    // focused may not arrive as a `modify` event.
    this.registerInterval(window.setInterval(() => void this.checkDisk(), 1000));
    // The iPad app sends the note as it saves it (D40).
    this.registerEvent(
      this.plugin.live.onChange((path) => {
        if (LiveNotes.matches(path, this.file.path)) void this.render();
      }),
    );
  }

  loadFile(): void {
    this.renderedText = null;
    void this.render();
  }

  /** While the embed is shown, reads the file again when its modification time or size changed. */
  private async checkDisk(): Promise<void> {
    if (document.hidden || !this.containerEl.isShown()) return;
    const stat = await this.plugin.app.vault.adapter.stat(this.file.path);
    if (!stat) return; // Deleted or moved: Obsidian updates the embed.
    const checked = `${stat.mtime}:${stat.size}`;
    if (checked === this.checkedStat) return;
    this.checkedStat = checked;
    noticeChange(this.plugin.app, this.file.path);
    await this.render();
  }

  /** Reads the file from disk, or takes the newer one from the iPad, and renders it if it changed. */
  private async render(): Promise<void> {
    const text = this.plugin.live.pick(this.file.path, await this.plugin.app.vault.adapter.read(this.file.path));
    if (text === this.renderedText) return;
    this.renderedText = text;
    const result = parseInkd(text);
    this.containerEl.empty();
    this.containerEl.toggleClass("inkidian-invert", this.plugin.settings.darkMode === "invert");
    if (!result.ok) {
      this.containerEl.createDiv({ cls: "inkidian-message", text: result.message });
      return;
    }
    if (isIPad()) {
      // Its own button, so it's clear which embed opens in the app.
      this.containerEl.addClass("inkidian-annotatable");
      appButton(this.containerEl, "Edit in Inkidian", openInInkidianUrl(this.plugin.app.vault.getName(), this.file.path)).addClass("inkidian-corner");
    }
    const svg = toDom(renderEmbed(result.document, this.idPrefix));
    // ![[Note.inkd|300]] sets a width, like it does for images.
    const width = Number(this.containerEl.getAttribute("width"));
    if (width > 0) svg.style.maxWidth = `${width}px`;
    this.containerEl.appendChild(svg);

    const pages = result.document.pages.length;
    if (pages > 1) {
      const footer = this.containerEl.createDiv({ cls: "inkidian-embed-footer", text: `Page 1 of ${pages} · ` });
      footer.createEl("a", { text: "Open note" }).addEventListener("click", (event) => {
        event.preventDefault();
        void this.plugin.app.workspace.getLeaf(false).openFile(this.file);
      });
    }
  }
}
