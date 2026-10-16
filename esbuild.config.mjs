import * as esbuild from "esbuild";
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import process from "node:process";

const production = process.argv[2] === "production";

// 两个部分的样式分文件维护，构建时拼成 Obsidian 要的单个 styles.css。
const STYLES = ["tokens.css", "variants.css", "find.css"];
function buildStyles() {
  const parts = STYLES.map((name) => `/* ==== ${name} ==== */\n${readFileSync(`styles/${name}`, "utf8").trimEnd()}\n`);
  mkdirSync("dist", { recursive: true });
  writeFileSync("dist/styles.css", parts.join("\n"));
  copyFileSync("manifest.json", "dist/manifest.json");
}

const stylesPlugin = {
  name: "bsrv-styles",
  setup(build) {
    build.onEnd(() => buildStyles());
  }
};

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron", "@codemirror/state", "@codemirror/view", "@codemirror/language", "@lezer/common"],
  format: "cjs",
  loader: { ".png": "dataurl" },
  target: "es2022",
  logLevel: "info",
  sourcemap: production ? false : "inline",
  minify: false,
  legalComments: "none",
  charset: "utf8",
  treeShaking: true,
  outfile: "dist/main.js",
  plugins: [stylesPlugin]
});

if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
