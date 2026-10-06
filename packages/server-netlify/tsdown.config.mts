import { defineConfig } from "tsdown";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function getNonWorkspaceDeps(cwd: string = process.cwd()): string[] {
  const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.devDependencies };
  return Object.keys(deps).filter(key => !deps[key]?.startsWith("workspace:"));
}

const nonWorkspaceDeps = getNonWorkspaceDeps();

/** twikoo-netlify 构建配置：ESM + CJS；仅外部化非 workspace 依赖 */
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  deps: {
    neverBundle: nonWorkspaceDeps,
  },
  outExtensions: ({ format }) => ({
    js: format === "cjs" ? ".cjs" : ".mjs",
    dts: format === "cjs" ? ".d.cts" : ".d.ts",
  }),
  outputOptions: (options, format) =>
    format === "cjs" ? { ...options, exports: "named" } : options,
});