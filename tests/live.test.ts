import * as crypto from "crypto";
import * as net from "net";
import type { Socket } from "net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveNotes, pairingId } from "../src/live";
import { qrSvg } from "../src/pairing";
import { toSvgString } from "../src/svg";
import { pairInInkidianUrl } from "../src/urls";

vi.mock("obsidian", () => ({
  Events: class {
    private readonly handlers = new Map<string, ((...data: unknown[]) => unknown)[]>();
    on(name: string, callback: (...data: unknown[]) => unknown) {
      this.handlers.set(name, [...(this.handlers.get(name) ?? []), callback]);
      return {};
    }
    trigger(name: string, ...data: unknown[]) {
      for (const callback of this.handlers.get(name) ?? []) callback(...data);
    }
  },
  Modal: class {},
  Setting: class {},
  normalizePath: (path: string) => path.replace(/\/+/g, "/").replace(/^\/|\/$/g, ""),
}));

// Records the Bonjour registration instead of running dns-sd.
const spawned: string[][] = [];
const spawn = ((_command: string, args: string[]) => {
  spawned.push(args);
  return { on() {}, kill() {} };
}) as unknown as typeof import("child_process").spawn;

// The same key and id as LiveMirrorTests.swift.
const KEY = "AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA";
const ID = "ae216c2ef5247a37";

const note = (modifiedAt: string, marker: string) => JSON.stringify({ format: "inkidian", formatVersion: 1, modifiedAt, marker, pages: [] });

/** A line as the app sends it: AES-256-GCM, base64 of nonce, ciphertext and tag. */
function sealed(vault: string, path: string, inkd: string, key = KEY): string {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(key, "base64url"), nonce);
  const data = Buffer.concat([cipher.update(JSON.stringify({ vault, path, inkd }), "utf8"), cipher.final()]);
  return `${Buffer.concat([nonce, data, cipher.getAuthTag()]).toString("base64")}\n`;
}

let live: LiveNotes;
let socket: Socket;

async function startAndConnect(vault: string): Promise<void> {
  spawned.length = 0;
  live = new LiveNotes(vault);
  live.start({ net, spawn, crypto }, KEY);
  await vi.waitFor(() => expect(spawned).toHaveLength(1));
  const [flag, name, type, domain, port, txt] = spawned[0];
  // Only the id goes on the network, never the vault's name or the key.
  expect([flag, name, type, domain, txt]).toEqual(["-R", `Inkidian ${ID}`, "_inkidian._tcp", "local", `id=${ID}`]);
  socket = net.connect(Number(port), "127.0.0.1");
}

function nextChange(): Promise<string> {
  return new Promise((resolve) => live.onChange(resolve));
}

afterEach(() => {
  socket?.destroy();
  live?.stop();
});

describe("live preview from the iPad (D40)", () => {
  it("announces the key's id", () => {
    expect(pairingId(crypto, Buffer.from(KEY, "base64url"))).toBe(ID);
  });

  it("shows the app's note until the file on disk is newer", async () => {
    await startAndConnect("Thomas");
    const changed = nextChange();
    // A decomposed "Ü", as the iPad may send it, split across two packets.
    const line = sealed("Thomas", "Handwriting/Übung.inkd".normalize("NFD"), note("2026-10-17T12:00:05Z", "live"));
    socket.write(line.slice(0, 20));
    socket.write(line.slice(20));
    const path = await changed;

    expect(LiveNotes.matches(path, "Handwriting/Übung.inkd")).toBe(true);
    const older = note("2026-10-17T12:00:01Z", "older");
    const sameSecond = note("2026-10-17T12:00:05Z", "same second");
    const newer = note("2026-10-17T12:00:09Z", "newer");
    expect(JSON.parse(live.pick("Handwriting/Übung.inkd", older)).marker).toBe("live");
    expect(JSON.parse(live.pick("Handwriting/Übung.inkd", sameSecond)).marker).toBe("live");
    expect(live.pick("Handwriting/Übung.inkd", newer)).toBe(newer);
    // The newer file replaced the live note for good.
    expect(live.pick("Handwriting/Übung.inkd", older)).toBe(older);
  });

  it("drops other keys, other vaults, broken lines and older saves", async () => {
    await startAndConnect("Thomas");
    const changed = nextChange();
    socket.write(sealed("Thomas", "A.inkd", note("2026-10-17T12:00:00Z", "other key"), crypto.randomBytes(32).toString("base64url")));
    socket.write(`${Buffer.from(JSON.stringify({ vault: "Thomas", path: "A.inkd", inkd: note("2026-10-17T12:00:00Z", "plain") })).toString("base64")}\n`);
    socket.write(sealed("Other", "A.inkd", note("2026-10-17T12:00:00Z", "other vault")));
    socket.write("not base64 at all\n");
    socket.write(sealed("Thomas", "B.inkd", note("2026-10-17T12:00:09Z", "newer")));
    expect(await changed).toBe("B.inkd");

    const disk = note("2026-10-17T11:00:00Z", "disk");
    expect(live.pick("A.inkd", disk)).toBe(disk);

    // An older save arriving late keeps the newer one.
    const both = new Promise<void>((resolve) => {
      let count = 0;
      live.onChange(() => ++count === 1 && resolve());
    });
    socket.write(sealed("Thomas", "B.inkd", note("2026-10-17T12:00:01Z", "older")));
    socket.write(sealed("Thomas", "C.inkd", note("2026-10-17T12:00:00Z", "marker")));
    await both;
    expect(JSON.parse(live.pick("B.inkd", disk)).marker).toBe("newer");
  });
});

describe("pairing (D40)", () => {
  it("puts the vault and the key in the link", () => {
    expect(pairInInkidianUrl("Mein Vault", KEY)).toBe(`inkidian://pair?vault=Mein%20Vault&key=${KEY}`);
  });

  it("draws the link as a QR code on white", () => {
    const svg = toSvgString(qrSvg(pairInInkidianUrl("Thomas", KEY)));
    expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain('fill="#fff"');
    expect(svg).toMatch(/<path d="(M\d+ \d+h1v1h-1z)+" fill="#000"\/>/);
  });
});
