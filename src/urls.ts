// Links from Obsidian to the Inkidian iPad app (PLAN §5.5, §6.3).

export function openInInkidianUrl(vault: string, path: string): string {
  return `inkidian://open?vault=${encodeURIComponent(vault)}&path=${encodeURIComponent(path)}`;
}

/** Without a name the app names the note after the current time. */
export function newInInkidianUrl(vault: string, folder: string, name?: string): string {
  const url = `inkidian://new?vault=${encodeURIComponent(vault)}&folder=${encodeURIComponent(folder)}`;
  return name === undefined ? url : `${url}&name=${encodeURIComponent(name)}`;
}

/**
 * The name the app gives a new note (`VaultFiles.defaultName`, in English), with
 * a number when it's taken, as the app does.
 */
export function newNoteName(now: Date, isTaken: (name: string) => boolean): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const base = `Note ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
  let name = base;
  for (let number = 2; isTaken(name); number++) name = `${base} ${number}`;
  return name;
}

/** The link in the pairing QR code: the iPad stores the key for this vault (D40). */
export function pairInInkidianUrl(vault: string, key: string): string {
  return `inkidian://pair?vault=${encodeURIComponent(vault)}&key=${encodeURIComponent(key)}`;
}

/**
 * Where a new note goes: the folder of the active note, otherwise the default
 * folder. The vault root is "".
 */
export function folderForNewNote(activeFolder: string | null, defaultFolder: string): string {
  return (activeFolder ?? defaultFolder).replace(/^\/+|\/+$/g, "");
}

/** Calls `find` until it returns something or `timeoutMs` has passed. */
export async function waitFor<T>(find: () => T | null, timeoutMs: number, intervalMs = 200): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const found = find();
    if (found !== null || Date.now() >= deadline) return found;
    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }
}
