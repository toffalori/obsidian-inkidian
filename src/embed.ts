import { Component, type TFile } from "obsidian";
import { appButton } from "./actions";
import { parseInkd } from "./inkd";
import type InkidianPlugin from "./main";
import { isIPad } from "./platform";
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
  }

  loadFile(): void {
    void this.render();
  }

  private async render(): Promise<void> {
    const result = parseInkd(await this.plugin.app.vault.cachedRead(this.file));
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
