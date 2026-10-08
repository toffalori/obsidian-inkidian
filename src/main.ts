import { addIcon, type Component, FileView, getLinkpath, MarkdownView, normalizePath, Notice, Platform, Plugin, TFile, type View } from "obsidian";
import { addHeaderAction, appButton } from "./actions";
import { isIPad } from "./platform";
import { InkdEmbed } from "./embed";
import { DEFAULT_SETTINGS, InkidianSettingTab, type InkidianSettings } from "./settings";
import { folderForNewNote, newInInkidianUrl, openInInkidianUrl, waitFor } from "./urls";
import { InkdView, VIEW_TYPE_INKD } from "./view";

/** The fountain nib of the app icon, in Obsidian's 100×100 icon box. */
const NIB_ICON = `<g transform="translate(50 50) scale(0.135) translate(-512 -494) rotate(32 512 512)" fill="currentColor">
<path d="M512 160C596 232 672 356 672 520L531 828.4V586.25A50 50 0 0 0 512 490Z"/>
<path d="M512 160C428 232 352 356 352 520L493 828.4V586.25A50 50 0 0 1 512 490Z"/>
</g>`;

export default class InkidianPlugin extends Plugin {
  settings: InkidianSettings = { ...DEFAULT_SETTINGS };
  /** PDF and image views with their "Annotate in Inkidian" header action or button. */
  private readonly annotatedViews = new WeakSet<View>();
  private readonly viewButtons = new WeakMap<View, HTMLAnchorElement>();
  private decorateFrame = 0;
  /** iPad: the modification time of each PDF or image the app sent back, read from disk. */
  private readonly savedInApp = new Map<string, number>();

  async onload(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) as Partial<InkidianSettings> | null) };
    addIcon("inkidian", NIB_ICON);
    this.registerView(VIEW_TYPE_INKD, (leaf) => new InkdView(leaf, this));
    this.registerExtensions(["inkd"], VIEW_TYPE_INKD);
    if (this.settings.embeds) this.registerEmbeds();
    this.addCommand({ id: "new-note", name: "New note", icon: "inkidian", callback: () => this.newNote() });
    this.registerAnnotateActions();
    if (isIPad()) this.versionResourcePaths();
    this.registerObsidianProtocolHandler("inkidian", (params) => void this.openFromApp(params.file));
    this.addSettingTab(new InkidianSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => void this.showSyncNoticeOnce());
  }

  async saveSettings({ rerender = false } = {}): Promise<void> {
    await this.saveData(this.settings);
    if (!rerender) return;
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_INKD)) {
      if (leaf.view instanceof InkdView) leaf.view.rerender();
    }
  }

  /**
   * Obsidian embeds custom file types through an internal registry, the one its
   * own image and PDF embeds use. It isn't public API, so it's feature-checked:
   * without it, `![[Note.inkd]]` stays a link (docs/embedding.md).
   */
  private registerEmbeds(): void {
    const registry = (this.app as unknown as { embedRegistry?: EmbedRegistry }).embedRegistry;
    if (typeof registry?.registerExtension !== "function" || typeof registry.unregisterExtension !== "function") return;
    registry.registerExtension("inkd", (context, file) => new InkdEmbed(this, context.containerEl, file));
    this.register(() => registry.unregisterExtension("inkd"));
  }

  /**
   * PDFs and images open in Inkidian to be annotated, from their view's header,
   * the file menu and a command. A PDF gets the ink as annotations (SPEC §9); an
   * image gets it in its pixels, when the user saves it (D24).
   */
  private registerAnnotateActions(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || !isAnnotatable(file)) return;
        menu.addItem((item) => item.setTitle("Annotate in Inkidian").setIcon("inkidian").onClick(() => this.editInInkidian(file)));
      }),
    );
    this.addCommand({
      id: "annotate-pdf",
      name: "Annotate PDF or image",
      icon: "inkidian",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || !isAnnotatable(file)) return false;
        if (!checking) this.editInInkidian(file);
        return true;
      },
    });
    this.app.workspace.onLayoutReady(() => this.addAnnotateViewActions());
    this.registerEvent(this.app.workspace.on("layout-change", () => this.addAnnotateViewActions()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.addAnnotateViewActions()));
    if (isIPad()) this.observeEmbeds();
  }

  private addAnnotateViewActions(): void {
    for (const leaf of [...this.app.workspace.getLeavesOfType("pdf"), ...this.app.workspace.getLeavesOfType("image")]) {
      const view = leaf.view;
      if (!(view instanceof FileView)) continue;
      if (isIPad()) {
        this.updateViewButton(view);
      } else if (!this.annotatedViews.has(view)) {
        this.annotatedViews.add(view);
        const action = addHeaderAction(view, "Annotate in Inkidian", () => {
          if (view.file && isAnnotatable(view.file)) this.editInInkidian(view.file);
        });
        if (action) this.register(() => action.remove());
      }
    }
  }

  /**
   * iPad: the nib in the top right corner of a PDF or image view, for the file it
   * shows now. In a PDF it sits at the right end of the PDF's toolbar, which
   * appears a moment after the view.
   */
  private updateViewButton(view: FileView): void {
    let button = this.viewButtons.get(view);
    if (!view.file || !isAnnotatable(view.file)) {
      button?.remove();
      return;
    }
    const href = openInInkidianUrl(this.app.vault.getName(), view.file.path);
    const toolbar = view.contentEl.querySelector<HTMLElement>(".pdf-toolbar-right");
    const parent = toolbar ?? view.contentEl;
    if (!button?.isConnected || button.parentElement !== parent) {
      button?.remove();
      const created = appButton(parent, "Annotate in Inkidian", href);
      if (!toolbar) {
        view.contentEl.addClass("inkidian-annotatable");
        created.addClass("inkidian-corner");
      }
      this.register(() => created.remove());
      this.viewButtons.set(view, created);
      button = created;
    }
    button.setAttribute("href", href);
  }

  /**
   * iPad: each embedded PDF and image in a note gets its own button, so it's
   * clear which one opens in the app. Obsidian renders these embeds itself, in
   * Reading view and Live Preview, so the plugin adds the buttons as they appear.
   * `.inkd` embeds have theirs from `InkdEmbed`.
   */
  private observeEmbeds(): void {
    const observer = new MutationObserver(() => this.scheduleDecorate());
    this.app.workspace.onLayoutReady(() => {
      observer.observe(this.app.workspace.containerEl, { childList: true, subtree: true });
      this.scheduleDecorate();
    });
    this.register(() => {
      observer.disconnect();
      window.cancelAnimationFrame(this.decorateFrame);
    });
  }

  /** Once per frame at most, however much Obsidian changes the page. */
  private scheduleDecorate(): void {
    if (this.decorateFrame) return;
    this.decorateFrame = window.requestAnimationFrame(() => {
      this.decorateFrame = 0;
      this.addAnnotateViewActions();
      this.decorateEmbeds();
    });
  }

  private decorateEmbeds(): void {
    for (const embed of Array.from(this.app.workspace.containerEl.querySelectorAll<HTMLElement>(".internal-embed[src]"))) {
      if (embed.hasClass("inkidian-embed") || embed.querySelector(":scope > .inkidian-app-button")) continue;
      const file = this.app.metadataCache.getFirstLinkpathDest(getLinkpath(embed.getAttribute("src") ?? ""), this.sourcePath(embed));
      if (!file || !isAnnotatable(file)) continue;
      embed.addClass("inkidian-annotatable");
      appButton(embed, "Annotate in Inkidian", openInInkidianUrl(this.app.vault.getName(), file.path)).addClass("inkidian-corner");
    }
  }

  /**
   * On iPad, Obsidian gives a file the same resource URL after it changed (on the
   * desktop the URL ends in `?<mtime>`), so the web view keeps showing a PDF or
   * image as it was before the app saved it, until Obsidian restarts (D31). This
   * adds the modification time on iPad too: Obsidian's, or the one read from disk
   * when the app sent the file back, if that is newer.
   */
  private versionResourcePaths(): void {
    const adapter = this.app.vault.adapter;
    const getResourcePath = adapter.getResourcePath.bind(adapter);
    adapter.getResourcePath = (path: string): string => {
      const url = getResourcePath(path);
      const file = this.app.vault.getAbstractFileByPath(path);
      const mtime = Math.max(file instanceof TFile ? file.stat.mtime : 0, this.savedInApp.get(path) ?? 0);
      return mtime && !url.includes("?") ? `${url}?${mtime}` : url;
    };
    this.register(() => {
      adapter.getResourcePath = getResourcePath;
    });
  }

  /** The note an embed is in, to resolve its link the way Obsidian does. */
  private sourcePath(element: HTMLElement): string {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView && leaf.view.containerEl.contains(element)) return leaf.view.file?.path ?? "";
    }
    return this.app.workspace.getActiveFile()?.path ?? "";
  }

  /**
   * The app's "Back to Obsidian" link: obsidian://inkidian?vault=…&file=…. Obsidian
   * notices a file the app just created only a moment after it comes back, so
   * wait up to 5 seconds before giving up (decision D18).
   */
  private async openFromApp(path: string | undefined): Promise<void> {
    if (!path) return;
    const normalized = normalizePath(path);
    const file = await waitFor(() => {
      const found = this.app.vault.getAbstractFileByPath(normalized);
      return found instanceof TFile ? found : null;
    }, 5000);
    if (!file) {
      new Notice(`Inkidian: “${normalized}” isn't in this vault.`);
      return;
    }
    // Obsidian may not have noticed the change yet, so it would keep the old URL.
    if (isIPad() && isAnnotatable(file)) {
      const stat = await this.app.vault.adapter.stat(normalized);
      if (stat) this.savedInApp.set(normalized, stat.mtime);
    }
    // A PDF or image that is open already shows the new ink right away, the way
    // Obsidian reloads it when it notices the change itself.
    const open = [...this.app.workspace.getLeavesOfType("pdf"), ...this.app.workspace.getLeavesOfType("image")].find(
      (leaf) => leaf.view instanceof FileView && leaf.view.file === file,
    );
    if (open?.view instanceof FileView) {
      this.app.workspace.setActiveLeaf(open, { focus: true });
      await open.view.onLoadFile(file);
      return;
    }
    await this.app.workspace.getLeaf(false).openFile(file);
  }

  editInInkidian(file: TFile): void {
    if (this.canOpenApp()) openExternal(openInInkidianUrl(this.app.vault.getName(), file.path));
  }

  newNote(): void {
    if (!this.canOpenApp()) return;
    const folder = this.app.workspace.getActiveFile()?.parent?.path ?? null;
    openExternal(newInInkidianUrl(this.app.vault.getName(), folderForNewNote(folder, this.settings.defaultFolder)));
  }

  /** The app exists only on iPad; elsewhere explain instead (PLAN §6.3). */
  private canOpenApp(): boolean {
    if (isIPad()) return true;
    new Notice(
      Platform.isIosApp
        ? "Inkidian is an iPad app. Open this vault in Obsidian on your iPad to write by hand."
        : "Inkidian runs on iPad. Open this note in Obsidian on your iPad to edit it.",
    );
    return false;
  }

  /** Obsidian Sync skips unknown file types unless the user allows them (PLAN §9). */
  private async showSyncNoticeOnce(): Promise<void> {
    if (this.settings.syncNoticeShown) return;
    new Notice("Inkidian: if you use Obsidian Sync, turn on “Sync all other types” in Settings → Sync, so your .inkd notes sync.", 15000);
    this.settings.syncNoticeShown = true;
    await this.saveData(this.settings);
  }
}

/** PDFs, and the images the app can write back (D24). */
const ANNOTATABLE = new Set(["pdf", "png", "jpg", "jpeg"]);

function isAnnotatable(file: TFile): boolean {
  return ANNOTATABLE.has(file.extension.toLowerCase());
}

/**
 * Opens the app the way a tapped link does. On iPad, window.open needed a second
 * tap; a link works on the first (PLAN §9's fallback, decision D18).
 */
function openExternal(url: string): void {
  const link = document.body.createEl("a", { href: url });
  link.click();
  link.remove();
}

/** The part of Obsidian's internal embed registry the plugin uses (see obsidian-typings). */
interface EmbedRegistry {
  registerExtension(extension: string, creator: (context: { containerEl: HTMLElement }, file: TFile, subpath?: string) => Component & { loadFile(): void }): void;
  unregisterExtension(extension: string): void;
}
