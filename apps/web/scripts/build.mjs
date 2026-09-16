import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  configFile: path.join(webRoot, "vite.config.ts"),
  root: webRoot,
});
