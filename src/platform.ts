import { Platform } from "obsidian";

/** The Inkidian app runs on iPad only. */
export function isIPad(): boolean {
  return Platform.isIosApp && Platform.isTablet;
}
