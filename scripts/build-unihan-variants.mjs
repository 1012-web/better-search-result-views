/**
 * 从 Unicode 官方字库 Unihan 生成「异体字检索」用的通用对照表：src/shared/unihan-variants.ts。
 *
 * 用法：node scripts/build-unihan-variants.mjs <Unihan.zip 路径>
 * 数据包下载自 https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip（Unicode 许可，可随插件分发）；
 * 数据包本身不进仓库，Unicode 出新版时重下、重跑本脚本即可。
 *
 * 只取 Unihan_Variants.txt 里三类字段，各存一张表，设置里可分别开关：
 * - 繁简对应：kTraditionalVariant、kSimplifiedVariant（如 鄴／邺、於／于、後／后）
 * - 同字异写：kZVariant（字义全同、只是写法不同）
 * - 语义异体：kSemanticVariant（意义相通但不同字，范围宽，默认关）
 * 每张表是一串「字对」：每两个码点一对，互为异体；字与自身的对应（如「汹」的简体仍是「汹」）不收。
 */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";
import { unzipSync, strFromU8 } from "fflate";

const zipPath = process.argv[2];
if (!zipPath) {
  console.error("用法：node scripts/build-unihan-variants.mjs <Unihan.zip 路径>");
  process.exit(2);
}

const files = unzipSync(readFileSync(zipPath), { filter: (file) => file.name === "Unihan_Variants.txt" });
const variants = files["Unihan_Variants.txt"];
if (!variants) {
  console.error("Unihan.zip 里没有 Unihan_Variants.txt");
  process.exit(2);
}
const text = strFromU8(variants);
const version = /Unicode (?:version|Version) ([\d.]+)|Unihan_Variants\.txt[^\n]*?([\d.]+)/.exec(text.slice(0, 2000));

const TABLES = {
  tradSimp: ["kTraditionalVariant", "kSimplifiedVariant"],
  z: ["kZVariant"],
  semantic: ["kSemanticVariant"]
};

const toChar = (code) => String.fromCodePoint(parseInt(code.slice(2), 16));
const pairs = Object.fromEntries(Object.keys(TABLES).map((key) => [key, new Set()]));

for (const line of text.split(/\r?\n/)) {
  if (!line.startsWith("U+")) continue;
  const [code, field, value] = line.split("\t");
  const table = Object.keys(TABLES).find((key) => TABLES[key].includes(field));
  if (!table) continue;
  const a = toChar(code);
  // 值形如「U+4E8E<kLau U+4E8F<kMatthews」：去掉 < 后的出处标注
  for (const token of value.split(/\s+/)) {
    const target = token.split("<")[0];
    if (!/^U\+[0-9A-F]+$/.test(target)) continue;
    const b = toChar(target);
    if (a === b) continue;
    pairs[table].add(a < b ? a + b : b + a);
  }
}

const header = [
  "// 由 scripts/build-unihan-variants.mjs 从 Unicode Unihan（Unihan_Variants.txt）生成，不要手改。",
  `// 生成日期：${new Date().toISOString().slice(0, 10)}${version ? `；Unihan 版本：${version[1] ?? version[2]}` : ""}`,
  "// 每张表是一串字对：按码点每两个一组，互为异体。",
  ""
];
const body = Object.entries(pairs).map(([key, set]) => {
  const packed = [...set].sort().join("");
  return `export const UNIHAN_${key.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()} = ${JSON.stringify(packed)};`;
});
writeFileSync("src/shared/unihan-variants.ts", [...header, ...body, ""].join("\n"));
for (const [key, set] of Object.entries(pairs)) console.log(`${key}: ${set.size} 对`);
