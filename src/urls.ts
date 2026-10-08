// Links from Obsidian to the Inkidian iPad app (PLAN §5.5, §6.3).

export function openInInkidianUrl(vault: string, path: string): string {
  return `inkidian://open?vault=${encodeURIComponent(vault)}&path=${encodeURIComponent(path)}`;
}

/** Without a name the app names the note after the current time. */
export function newInInkidianUrl(vault: string, folder: string): string {
  return `inkidian://new?vault=${encodeURIComponent(vault)}&folder=${encodeURIComponent(folder)}`;
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
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
