import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(webRoot, "../..");

async function loadVite() {
  const candidates = [
    path.join(webRoot, "node_modules", "vite", "dist", "node", "index.js"),
    path.join(repoRoot, "node_modules", "vite", "dist", "node", "index.js"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return import(pathToFileURL(candidate).href);
    }
  }

  try {
    return await import("vite");
  } catch (error) {
    const checked = candidates.join("\n  - ");
    throw new Error(
      `Unable to load vite. Checked:\n  - ${checked}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

const { build } = await loadVite();

await build({
  configFile: path.join(webRoot, "vite.config.ts"),
  root: webRoot,
});
