import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const action = process.argv[2];

if (!fs.existsSync(path.join(webRoot, "package.json"))) {
  console.error(`[vercel-web] missing package.json in ${webRoot}`);
  process.exit(1);
}

const npmArgs =
  action === "install"
    ? ["install", "--workspaces=false", "--no-fund", "--no-audit"]
    : action === "build"
      ? ["run", "build"]
      : null;

if (!npmArgs) {
  console.error("[vercel-web] usage: node run-vercel.mjs <install|build>");
  process.exit(1);
}

console.log(`[vercel-web] cwd=${webRoot}`);
console.log(`[vercel-web] npm ${npmArgs.join(" ")}`);
const result = spawnSync("npm", npmArgs, {
  cwd: webRoot,
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
