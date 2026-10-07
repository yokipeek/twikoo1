import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** 防止部署配置重新包含整个仓库或遗漏运行时依赖。 */
describe("Netlify 函数打包配置", () => {
  const config = readFileSync(new URL("../../../netlify.toml", import.meta.url), "utf8");
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { dependencies: Record<string, string> };

  /** 自动追踪依赖，不额外包含整个仓库。 */
  it("仅使用 esbuild 自动追踪运行时文件", () => {
    expect(config).toMatch(/^\[functions\]$/m);
    expect(config).toMatch(/^\s*node_bundler = "esbuild"$/m);
    expect(config).not.toMatch(/^\s*included_files\s*=/m);
    expect(config).not.toMatch(/^\[functions\.directory\]$/m);
  });

  /** 外部化依赖必须在适配器中声明，且不能重复。 */
  it("外部化列表包含全部运行时依赖且没有重复项", () => {
    const externalList = config.match(/external_node_modules\s*=\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(externalList).not.toBe("");
    const externalPackages = Array.from(
      externalList.matchAll(/"([^"]+)"/g),
      /** 提取外部化包名。 */
      (match) => match[1],
    );
    expect(new Set(externalPackages).size).toBe(externalPackages.length);
    expect(externalPackages.sort()).toEqual(Object.keys(manifest.dependencies).sort());
    expect(externalPackages).toContain("tencentcloud-sdk-nodejs-tms");
    expect(externalPackages).not.toContain("tencentcloud-sdk-nodejs");
  });

  /** 评论接口必须返回同步响应，不能改为后台函数。 */
  it("保留 twikoo 同步接口", () => {
    expect(config).not.toMatch(/^\s*generator\s*=/m);
    expect(config).toMatch(/^\s*functions = "netlify\/functions"$/m);
    const entry = readFileSync(
      new URL("../../../netlify/functions/twikoo.mjs", import.meta.url),
      "utf8",
    );
    expect(entry).toContain('export { default } from "twikoo-netlify"');
  });

  /** 根目录部署命令必须明确选择工作区和配置文件。 */
  it("部署脚本明确选择 Netlify 工作区", () => {
    const rootManifest = JSON.parse(
      readFileSync(new URL("../../../package.json", import.meta.url), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(rootManifest.scripts["deploy:netlify"]).toBe(
      "netlify deploy --filter twikoo-netlify --config netlify.toml",
    );
  });
});
