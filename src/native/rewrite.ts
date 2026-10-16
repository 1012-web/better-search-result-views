/**
 * 把用户在 Obsidian 自带搜索框里输入的普通词，按勾选的选项翻译成自带搜索认得的正则（纯函数，不依赖 obsidian）。
 *
 * 只改「普通的词和引号短语」；操作符（file:、path:、tag:、line:…连同它的参数）、自己写的 /正则/、
 * [属性]、OR、括号、排除符 - 原样保留。什么都没勾，或者改出来和原词等价时，原样不动。
 *
 * 自带搜索的正则：不带 u 标志（不认 \\p{…}，扩展区的字要写成分支）、带 m 标志（^ 按行）、支持后行断言，
 * 这些都是在 Obsidian 1.14 里实测过的。
 */
import { charPattern, type VariantTable } from "../shared/variants";
import type { SearchOptions } from "../variants/search";

export interface RewriteResult {
  /** 交给自带搜索的查询串 */
  query: string;
  /** 有没有词被改写 */
  changed: boolean;
  /** 有没有遇到操作符、正则、属性查询这类原样放过的高级语法 */
  skipped: boolean;
}

/** 自带搜索认得的操作符：连同它的参数一起原样放过 */
const OPERATORS = new Set(["file", "path", "content", "match-case", "ignore-case", "tag", "line", "block", "section", "task", "task-todo", "task-done"]);

/** 字与字之间总是可以跳过的：空白与 Markdown 记号，双链的括号与「目标|」 */
const BASE_GAP = ["[\\t\\x20*_~=`#>|]", "\\[\\[(?:[^\\]|]*\\|)?", "\\]\\]"];
/** 跨页码与折行：折行，和 <!--p.N--> 页码标记 */
const ANCHOR_GAP = ["\\r?\\n", "<!--\\s*p\\.-?\\d+\\s*-->"];
/** 跨标注与注释：别的 HTML 注释（页码标记不在内，它归「跨页码」管）、%%备注%%、HTML 标签、脚注号 */
const MARKUP_GAP = ["<!--(?!\\s*p\\.-?\\d+\\s*-->)[^>]*-->", "%%[^%]*%%", "<\\/?[a-zA-Z][^<>]*>", "\\[\\^[^\\]]+\\]", "\\^\\[[^\\]]*\\]"];
/** 忽略标点：自带搜索的正则不认 \\p{P}，只能列明确的字符 */
const PUNCT_GAP = ["[，。、；：？！“”‘’「」『』（）《》〈〉【】〔〕—…·,.;:?!\"'()\\[\\]{}\\-]"];
/**
 * 只搜标题：词前面要有「行首的 # 标题标记」，且词在同一行里。
 * 用后行断言写，高亮时只高亮词本身；断言写成两截拼起来，因为它是交给自带搜索的正则文本，不是本插件自己的正则。
 * 老 iOS（16.4 以前）的引擎不认后行断言，那里退回把标题标记也算进命中的写法。
 */
const LOOKBEHIND_OPEN = "(?" + "<=";
const HEADING_LINE = "^#{1,6}[\\t\\x20]+[^\\n]*";

export function lookbehindSupported(): boolean {
  try {
    new RegExp(`${LOOKBEHIND_OPEN}a)b`);
    return true;
  } catch {
    return false;
  }
}

function headingPrefix(lookbehind: boolean): string {
  return lookbehind ? `${LOOKBEHIND_OPEN}${HEADING_LINE})` : `${HEADING_LINE}?`;
}

const HAN = /[㐀-鿿豈-﫿]|[\ud840-\ud87f][\udc00-\udfff]/;
const WORD = /^[A-Za-z0-9]$/;

function gapPattern(options: SearchOptions): string {
  const parts: string[] = [];
  const crosses = options.crossAnchors || options.crossMarkup;
  if (crosses) parts.push(...BASE_GAP);
  // 标题在一行里：不跨折行，也不跨页码标记
  if (options.crossAnchors && !options.titlesOnly) parts.push(...ANCHOR_GAP);
  if (options.crossMarkup) parts.push(...MARKUP_GAP);
  if (options.ignorePunct) parts.push(...PUNCT_GAP);
  return parts.length ? `(?:${parts.join("|")})*` : "";
}

function anyOptionOn(options: SearchOptions): boolean {
  return options.variants || options.crossAnchors || options.crossMarkup || options.ignorePunct || options.titlesOnly;
}

/** 一个词（或引号短语里的内容）→ /正则/；不需要改写时返回 null */
function rewriteTerm(term: string, options: SearchOptions, table: VariantTable | null, gap: string, lookbehind: boolean): string | null {
  const chars = [...term].filter((ch) => !/\s/u.test(ch));
  if (!chars.length) return null;
  if (!options.titlesOnly && !chars.some((ch) => HAN.test(ch))) return null;
  const variantTable = options.variants ? table : null;
  let body = "";
  let plain = true;
  chars.forEach((ch, index) => {
    // 英文字母、数字之间不加缝隙，免得「ab」匹配「a b」
    if (index > 0 && gap && !(WORD.test(chars[index - 1]) && WORD.test(ch))) {
      body += gap;
      plain = false;
    }
    const pattern = charPattern(ch, variantTable);
    if (pattern !== charPattern(ch, null)) plain = false;
    body += pattern;
  });
  // 改出来和原词等价（没有异体、没有缝隙、没有标题限制）：不如原样交给自带搜索
  if (plain && !options.titlesOnly) return null;
  return `/${options.titlesOnly ? headingPrefix(lookbehind) : ""}${body}/`;
}

/** 从 start（指向开括号）起找配对的闭括号，返回它的下标；没有配对返回 -1 */
function matchingParen(query: string, start: number): number {
  let depth = 0;
  for (let i = start; i < query.length; i++) {
    if (query[i] === "(") depth++;
    else if (query[i] === ")" && --depth === 0) return i;
  }
  return -1;
}

/** 从 start（指向开头的 /）起找没被转义的结尾 /；没有返回 -1 */
function regexEnd(query: string, start: number): number {
  for (let i = start + 1; i < query.length; i++) {
    if (query[i] === "\\") i++;
    else if (query[i] === "/") return i;
  }
  return -1;
}

export function rewriteQuery(query: string, options: SearchOptions, table: VariantTable | null, env: { lookbehind?: boolean } = {}): RewriteResult {
  if (!query.trim() || !anyOptionOn(options)) return { query, changed: false, skipped: false };
  const gap = gapPattern(options);
  const lookbehind = env.lookbehind ?? lookbehindSupported();
  let out = "";
  let changed = false;
  let skipped = false;
  const n = query.length;
  const isSpace = (ch: string) => /\s/u.test(ch);
  const copyTo = (end: number, from: number) => {
    out += query.slice(from, end);
  };

  let i = 0;
  while (i < n) {
    const ch = query[i];
    if (isSpace(ch) || ch === "(" || ch === ")" || ch === "-") {
      out += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      const end = query.indexOf('"', i + 1);
      if (end < 0) {
        copyTo(n, i);
        break;
      }
      const rewritten = rewriteTerm(query.slice(i + 1, end), options, table, gap, lookbehind);
      if (rewritten) {
        out += rewritten;
        changed = true;
      } else copyTo(end + 1, i);
      i = end + 1;
      continue;
    }
    if (ch === "/") {
      const end = regexEnd(query, i);
      if (end < 0) {
        copyTo(n, i);
        break;
      }
      copyTo(end + 1, i);
      skipped = true;
      i = end + 1;
      continue;
    }
    if (ch === "[") {
      const end = query.indexOf("]", i);
      const stop = end < 0 ? n : end + 1;
      copyTo(stop, i);
      skipped = true;
      i = stop;
      continue;
    }
    // 一个词：到空白、括号、引号为止
    let j = i;
    while (j < n && !isSpace(query[j]) && query[j] !== "(" && query[j] !== ")" && query[j] !== '"') j++;
    const word = query.slice(i, j);
    const operator = /^([A-Za-z-]+):/.exec(word);
    if (operator && OPERATORS.has(operator[1].toLowerCase())) {
      // 操作符连同它的参数（括号组、引号串，或到下一个空白）一起原样放过
      let k = i + operator[0].length;
      if (query[k] === "(") {
        const close = matchingParen(query, k);
        k = close < 0 ? n : close + 1;
      } else if (query[k] === '"') {
        const close = query.indexOf('"', k + 1);
        k = close < 0 ? n : close + 1;
      } else {
        while (k < n && !isSpace(query[k]) && query[k] !== ")") k++;
      }
      copyTo(k, i);
      skipped = true;
      i = k;
      continue;
    }
    if (word === "OR" || word.startsWith("#")) {
      out += word;
      i = j;
      continue;
    }
    const rewritten = rewriteTerm(word, options, table, gap, lookbehind);
    if (rewritten) {
      out += rewritten;
      changed = true;
    } else out += word;
    i = j;
  }
  return { query: out, changed, skipped };
}
