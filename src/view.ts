import { FileView, setIcon, type TFile, type WorkspaceLeaf } from "obsidian";
import { addHeaderAction, appButton } from "./actions";
import { parseInkd } from "./inkd";
import { LiveNotes } from "./live";
import type InkidianPlugin from "./main";
import { isIPad, noticeChange } from "./platform";
import { renderPage } from "./render";
import { toDom } from "./svg";
import { openInInkidianUrl } from "./urls";
import { clampZoom, stepZoom, wheelZoom } from "./zoom";

export const VIEW_TYPE_INKD = "inkidian";

let viewCount = 0;

/** A point on a page, as fractions of its size: it stays put while zooming. */
type Anchor = { page: Element; x: number; y: number };

/** Read-only preview of an `.inkd` note (PLAN §6.2). */
export class InkdView extends FileView {
  private renderedText: string | null = null;
  /** The file's modification time and size at the last check. */
  private checkedStat = "";
  private readonly idPrefix = `inkidian-${++viewCount}`;
  /** 1 is the width that fits (INK-64). */
  private zoom = 1;
  private pagesEl: HTMLElement | null = null;
  private zoomBar: HTMLElement | null = null;
  private zoomLabel: HTMLElement | null = null;
  private pinch: { distance: number; zoom: number; anchor: Anchor | null } | null = null;
  private drag: { x: number; y: number; left: number; top: number } | null = null;

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
    // A change Obsidian Sync downloads while Obsidian isn't focused may not reach
    // the view as a `modify` event, so also check the file every second.
    this.registerInterval(window.setInterval(() => void this.checkDisk(), 1000));
    // The iPad app sends the note as it saves it (D40).
    this.registerEvent(
      this.plugin.live.onChange((path) => {
        if (this.file && LiveNotes.matches(path, this.file.path)) void this.refresh();
      }),
    );
    this.addZoom();
  }

  onResize(): void {
    this.applyZoom();
  }

  async onLoadFile(file: TFile): Promise<void> {
    this.renderedText = null;
    this.zoom = 1;
    await this.refresh();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.renderedText = null;
    this.pagesEl = null;
    this.contentEl.empty();
  }

  /** Renders again with the current settings. */
  rerender(): void {
    this.renderedText = null;
    void this.refresh();
  }

  /** While the view is shown, reads the file again when its modification time or size changed. */
  private async checkDisk(): Promise<void> {
    const file = this.file;
    if (!file || document.hidden || !this.contentEl.isShown()) return;
    const stat = await this.app.vault.adapter.stat(file.path);
    const checked = stat ? `${stat.mtime}:${stat.size}` : "";
    if (checked === this.checkedStat) return;
    this.checkedStat = checked;
    noticeChange(this.app, file.path);
    await this.refresh();
  }

  /** Reads the file from disk, or takes the newer one from the iPad, and renders it if it changed. */
  private async refresh(): Promise<void> {
    const file = this.file;
    if (!file) return;
    let text: string;
    try {
      text = await this.app.vault.adapter.read(file.path);
    } catch {
      return; // Deleted or moved: Obsidian closes or retargets the view.
    }
    text = this.plugin.live.pick(file.path, text);
    if (text === this.renderedText || file !== this.file) return;
    this.renderedText = text;
    this.render(text);
  }

  private render(text: string): void {
    const result = parseInkd(text);
    this.contentEl.empty();
    this.contentEl.toggleClass("inkidian-invert", this.plugin.settings.darkMode === "invert");
    this.pagesEl = null;
    this.zoomBar?.toggle(result.ok);
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
    this.pagesEl = pages;
    this.applyZoom();
  }

  /**
   * −, the zoom and + in the bottom right corner; the zoom goes back to the width
   * that fits. Also Ctrl/Cmd + scroll, pinching, and dragging with the mouse
   * where the pages don't fit (INK-64).
   */
  private addZoom(): void {
    const bar = this.containerEl.createDiv({ cls: "inkidian-zoom-bar" });
    const button = (icon: string | null, label: string, zoom: () => number): HTMLElement => {
      const el = bar.createDiv({ cls: "clickable-icon", attr: { "aria-label": label } });
      if (icon) setIcon(el, icon);
      el.addEventListener("click", () => this.zoomAt(zoom(), null));
      return el;
    };
    button("minus", "Zoom out", () => stepZoom(this.zoom, -1));
    this.zoomLabel = button(null, "Fit width", () => 1);
    this.zoomLabel.addClass("inkidian-zoom-label");
    button("plus", "Zoom in", () => stepZoom(this.zoom, 1));
    this.zoomBar = bar;

    const scroller = this.contentEl;
    // Also the trackpad's pinch, which arrives as a wheel with Ctrl.
    this.registerDomEvent(scroller, "wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      this.zoomAt(wheelZoom(this.zoom, event.deltaY), { x: event.clientX, y: event.clientY });
    }, { passive: false });

    const fingers = (touches: TouchList) => {
      const [a, b] = [touches[0], touches[1]];
      return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) };
    };
    this.registerDomEvent(scroller, "touchstart", (event) => {
      if (event.touches.length !== 2) return;
      const { x, y, distance } = fingers(event.touches);
      this.pinch = { distance, zoom: this.zoom, anchor: this.anchorAt(x, y) };
    }, { passive: true });
    // The point between the fingers stays under them, as they move apart and along.
    this.registerDomEvent(scroller, "touchmove", (event) => {
      if (!this.pinch || event.touches.length !== 2) return;
      event.preventDefault();
      const { x, y, distance } = fingers(event.touches);
      this.setZoom(clampZoom((this.pinch.zoom * distance) / Math.max(1, this.pinch.distance)), this.pinch.anchor, x, y);
    }, { passive: false });
    const endPinch = (event: TouchEvent) => {
      if (event.touches.length < 2) this.pinch = null;
    };
    this.registerDomEvent(scroller, "touchend", endPinch);
    this.registerDomEvent(scroller, "touchcancel", endPinch);

    this.registerDomEvent(scroller, "pointerdown", (event) => {
      const onPages = event.target instanceof Element && event.target.closest(".inkidian-pages");
      if (event.pointerType !== "mouse" || event.button !== 0 || !onPages || !this.canPan()) return;
      event.preventDefault();
      this.drag = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
      scroller.setPointerCapture(event.pointerId);
      scroller.addClass("inkidian-dragging");
    });
    this.registerDomEvent(scroller, "pointermove", (event) => {
      if (!this.drag) return;
      scroller.scrollLeft = this.drag.left - (event.clientX - this.drag.x);
      scroller.scrollTop = this.drag.top - (event.clientY - this.drag.y);
    });
    const endDrag = () => {
      this.drag = null;
      scroller.removeClass("inkidian-dragging");
    };
    this.registerDomEvent(scroller, "pointerup", endDrag);
    this.registerDomEvent(scroller, "pointercancel", endDrag);
  }

  /** Zooms around a point on screen, or around the middle of the view. */
  private zoomAt(zoom: number, point: { x: number; y: number } | null): void {
    const rect = this.contentEl.getBoundingClientRect();
    const { x, y } = point ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    this.setZoom(zoom, this.anchorAt(x, y), x, y);
  }

  /** The point under (x, y) on screen, on the page there or the nearest one. */
  private anchorAt(x: number, y: number): Anchor | null {
    let nearest: Element | null = null;
    let nearestDistance = Infinity;
    for (const page of Array.from(this.pagesEl?.children ?? [])) {
      const rect = page.getBoundingClientRect();
      const distance = Math.max(rect.top - y, y - rect.bottom, 0);
      if (distance < nearestDistance) [nearest, nearestDistance] = [page, distance];
    }
    if (!nearest) return null;
    const rect = nearest.getBoundingClientRect();
    return { page: nearest, x: (x - rect.left) / rect.width, y: (y - rect.top) / rect.height };
  }

  /** Zooms, then scrolls so the anchor is at (x, y) on screen again. */
  private setZoom(zoom: number, anchor: Anchor | null, x: number, y: number): void {
    this.zoom = zoom;
    this.applyZoom();
    if (!anchor) return;
    const rect = anchor.page.getBoundingClientRect();
    this.contentEl.scrollLeft += rect.left + anchor.x * rect.width - x;
    this.contentEl.scrollTop += rect.top + anchor.y * rect.height - y;
  }

  private applyZoom(): void {
    this.pagesEl?.style.setProperty("--inkidian-zoom", String(this.zoom));
    this.zoomLabel?.setText(`${Math.round(this.zoom * 100)}%`);
    this.contentEl.toggleClass("inkidian-pannable", this.canPan());
  }

  /** Not all of the pages are visible. */
  private canPan(): boolean {
    const el = this.contentEl;
    return el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;
  }
}
