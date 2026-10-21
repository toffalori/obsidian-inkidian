import { type EventRef, Events, normalizePath } from "obsidian";
// Types only: the modules themselves come from main.ts, on the desktop.
type Net = typeof import("net");
type Socket = import("net").Socket;
type Crypto = typeof import("crypto");

/** The longest message accepted, against a sender that never ends its line. */
const MAX_MESSAGE = 64 * 1024 * 1024;

/** Node's modules for the receiver, which only exist on the desktop. */
export interface NodeModules {
  net: Net;
  spawn: typeof import("child_process").spawn;
  crypto: Crypto;
}

interface LiveMessage {
  vault: string;
  path: string;
  inkd: string;
}

/**
 * Live preview from the iPad (prototype, D40). The app sends every note it saves
 * to the Macs it's paired with, and open views and embeds show it before Obsidian
 * Sync brings the file. Nothing is written: the file stays Sync's. Mac only: found
 * over Bonjour through macOS's `dns-sd`, which announces only an id made from the
 * pairing key. Each line is a note sealed with that key (AES-256-GCM, base64:
 * nonce, ciphertext, tag); anything else is dropped.
 */
export class LiveNotes extends Events {
  private readonly notes = new Map<string, { text: string; modifiedAt: string }>();
  private server: import("net").Server | null = null;
  private readonly sockets = new Set<Socket>();
  private advertiser: import("child_process").ChildProcess | null = null;
  private crypto: Crypto | null = null;
  private key: Buffer | null = null;

  constructor(private readonly vaultName: string) {
    super();
  }

  /** Starts receiving with the pairing key (base64url), or starts over with a new one. */
  start({ net, spawn, crypto }: NodeModules, key: string): void {
    const bytes = Buffer.from(key, "base64url");
    if (this.server && this.key?.equals(bytes)) return;
    this.stop();
    this.crypto = crypto;
    this.key = bytes;
    const id = pairingId(crypto, bytes);
    const server = net.createServer((socket) => this.accept(socket));
    server.on("error", (error) => console.error("Inkidian live preview:", error));
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string" || this.server !== server) return;
      const name = `Inkidian ${id}`;
      this.advertiser = spawn("/usr/bin/dns-sd", ["-R", name, "_inkidian._tcp", "local", String(address.port), `id=${id}`], { stdio: "ignore" });
      this.advertiser.on("error", (error) => console.error("Inkidian live preview:", error));
    });
    this.server = server;
  }

  stop(): void {
    this.advertiser?.kill();
    this.advertiser = null;
    this.server?.close();
    this.server = null;
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }

  /** Calls back with the path of each note that arrives. */
  onChange(callback: (path: string) => void): EventRef {
    return this.on("change", (path) => callback(path as string));
  }

  /** Whether a path from `onChange` is this file's. */
  static matches(changed: string, path: string): boolean {
    return changed === key(path);
  }

  /** The text to show for a note read from disk: the live one, unless the file is newer. */
  pick(path: string, disk: string): string {
    const live = this.notes.get(key(path));
    if (!live) return disk;
    if (modifiedAt(disk) > live.modifiedAt) {
      this.notes.delete(key(path));
      return disk;
    }
    return live.text;
  }

  private accept(socket: Socket): void {
    this.sockets.add(socket);
    socket.on("close", () => this.sockets.delete(socket));
    socket.setEncoding("utf8");
    const parts: string[] = [];
    let size = 0;
    socket.on("data", (chunk: string) => {
      let start = 0;
      let end: number;
      while ((end = chunk.indexOf("\n", start)) >= 0) {
        parts.push(chunk.slice(start, end));
        this.receive(parts.join(""));
        parts.length = 0;
        size = 0;
        start = end + 1;
      }
      const rest = chunk.slice(start);
      parts.push(rest);
      size += rest.length;
      if (size > MAX_MESSAGE) socket.destroy();
    });
    socket.on("error", () => socket.destroy());
  }

  private receive(line: string): void {
    const text = this.open(line);
    if (text === null) return;
    let message: unknown;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!isMessage(message) || message.vault.normalize("NFC") !== this.vaultName.normalize("NFC")) return;
    const path = key(message.path);
    const time = modifiedAt(message.inkd);
    // A save that arrives late, or is sent again, doesn't replace a newer one.
    const current = this.notes.get(path);
    if (current && time < current.modifiedAt) return;
    this.notes.set(path, { text: message.inkd, modifiedAt: time });
    this.trigger("change", path);
  }

  /** The line's text, if it was sealed with this Mac's key. */
  private open(line: string): string | null {
    if (!this.crypto || !this.key) return null;
    try {
      const sealed = Buffer.from(line, "base64");
      if (sealed.length < 28) return null;
      const decipher = this.crypto.createDecipheriv("aes-256-gcm", this.key, sealed.subarray(0, 12));
      decipher.setAuthTag(sealed.subarray(sealed.length - 16));
      return Buffer.concat([decipher.update(sealed.subarray(12, sealed.length - 16)), decipher.final()]).toString("utf8");
    } catch {
      return null;
    }
  }
}

/** What the Mac announces instead of the key: the first 8 bytes of its SHA-256, in hex. */
export function pairingId(crypto: Crypto, key: Buffer): string {
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

/** Paths as Obsidian writes them, with names in one Unicode form (the iPad may differ). */
function key(path: string): string {
  return normalizePath(path).normalize("NFC");
}

/** The note's `modifiedAt` (ISO 8601, so it sorts by time), or "" if it has none. */
function modifiedAt(text: string): string {
  try {
    const value = (JSON.parse(text) as { modifiedAt?: unknown }).modifiedAt;
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function isMessage(value: unknown): value is LiveMessage {
  const message = value as Partial<LiveMessage> | null;
  return typeof message?.vault === "string" && typeof message.path === "string" && typeof message.inkd === "string";
}
