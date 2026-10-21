import { type App, Platform } from "obsidian";

/** The Inkidian app runs on iPad only. */
export function isIPad(): boolean {
  return Platform.isIosApp && Platform.isTablet;
}

/**
 * Obsidian on iPad doesn't watch the vault: it notices a file the app changed
 * only when it's focused again, and Sync uploads the file only then. Next to
 * the app in Split View, the plugin asks Obsidian to check the file at once,
 * through the adapter's `update`, the call its own writes end with. It isn't
 * public API, so it's feature-checked.
 */
export function noticeChange(app: App, path: string): void {
  const adapter = app.vault.adapter as unknown as { update?: (path: string) => Promise<void> };
  if (typeof adapter.update === "function") void adapter.update(path);
}
