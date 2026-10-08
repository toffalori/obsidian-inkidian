import { type ItemView, setIcon } from "obsidian";
import { isIPad } from "./platform";

/**
 * The nib in a view's header, except on iPad: there the header takes the first
 * tap to show the note's title, so the tap on the nib got lost (D18). On iPad,
 * the same nib sits in the top right corner of views and embeds (`appButton`).
 */
export function addHeaderAction(view: ItemView, title: string, onClick: () => void): HTMLElement | null {
  return isIPad() ? null : view.addAction("inkidian", title, onClick);
}

/**
 * The round nib that opens the app, the same for notes, PDFs, images and embeds.
 * A real link, which opens the app on the first tap.
 */
export function appButton(parent: HTMLElement, title: string, href: string): HTMLAnchorElement {
  const button = parent.createEl("a", { cls: "inkidian-app-button", href, attr: { "aria-label": title } });
  setIcon(button, "inkidian");
  // In Live Preview a tap on an embed would move the cursor into it.
  button.addEventListener("pointerdown", (event) => event.stopPropagation());
  button.addEventListener("mousedown", (event) => event.stopPropagation());
  return button;
}
