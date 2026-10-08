import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Shared with the iOS tests: format/ is the single source of truth. It sits next to
// the plugin in the public plugin repo and one level up in the Inkidian repo.
const nextToPlugin = fileURLToPath(new URL("../format/", import.meta.url));
export const formatDir = existsSync(nextToPlugin) ? nextToPlugin : fileURLToPath(new URL("../../format/", import.meta.url));
export const sampleNames = readdirSync(formatDir + "samples").filter((name) => name.endsWith(".inkd")).sort();
export const readSample = (name: string) => readFileSync(formatDir + "samples/" + name, "utf8");
