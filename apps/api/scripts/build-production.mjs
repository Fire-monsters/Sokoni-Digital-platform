import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
await build({
  absWorkingDir: fileURLToPath(new URL("..", import.meta.url)),
  entryPoints: {
    server: "src/server.ts",
    "scripts/provision-staff": "src/scripts/provision-staff.ts",
    "scripts/provision-warehouse": "src/scripts/provision-warehouse.ts",
  },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outdir: "dist",
  outExtension: { ".js": ".mjs" },
  external: Object.keys(manifest.dependencies).filter(
    (name) => !name.startsWith("@sokoni-digital/"),
  ),
  logLevel: "info",
});
