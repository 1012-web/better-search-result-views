import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// obsidian 的 npm 包只有类型定义没有运行时代码，测试里换成最小实现。
export default defineConfig({
  resolve: { alias: { obsidian: fileURLToPath(new URL("./tests/stubs/obsidian.ts", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] }
});
