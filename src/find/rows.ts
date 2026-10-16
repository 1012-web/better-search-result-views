/**
 * 结果列表的纯函数（不依赖 obsidian，便于测试）：一条命中怎么显示成一行、
 * 在命中之间怎么走、跳过去以后命中该落在屏幕的哪个高度。
 */
import { cleanForDisplay } from "../variants/search";
import { matchesLabel, t } from "../i18n";

/** 一行里命中之前最多留几个字：再多，命中的词就被挤到面板右边看不见了 */
export const BEFORE_CHARS = 12;
/** 命中之后最多留几个字（面板放不下的由样式截断） */
export const AFTER_CHARS = 40;
/** 取上下文时往前、往后最多看多少原文（标签、注释要占掉不少） */
const RAW_BEFORE = 400;
const RAW_AFTER = 240;

export interface RowParts {
  before: string;
  match: string;
  after: string;
}

/**
 * 命中所在那一行的上下文（不越过换行，标题的行不会带上下一段）：
 * 命中之前、之后各一段，已去掉标签、注释与 Markdown 记号。
 */
export function lineContext(text: string, from: number, to: number): { before: string; after: string } {
  const lineStart = text.lastIndexOf("\n", from - 1) + 1;
  const nextBreak = text.indexOf("\n", to);
  const lineEnd = nextBreak < 0 ? text.length : nextBreak;
  const start = Math.max(lineStart, from - RAW_BEFORE);
  let before = text.slice(start, from);
  // 从行中间截的：可能截在一个标签里面，丢掉剩下的半截；从行首起的：去掉引用、列表的记号
  if (start > lineStart) before = before.replace(/^[^<>]*>/, "");
  else before = before.replace(/^[\s>]*(?:[-+*]\s+|\d+[.)]\s+)?/, "");
  const end = Math.min(lineEnd, to + RAW_AFTER);
  let after = text.slice(to, end);
  if (end < lineEnd) after = after.replace(/<[^<>]*$/, "");
  // 命中落在 [[双链]] 里面：链接被切成两半，各自都凑不成完整的 [[…]]，要单独去掉前半截的「[[」（连同「目标|」）与后半截的「]]」
  const open = before.lastIndexOf("[[");
  if (open >= 0 && !before.includes("]]", open)) {
    const inner = before.slice(open + 2);
    before = before.slice(0, open) + inner.slice(inner.lastIndexOf("|") + 1);
    const close = after.indexOf("]]");
    if (close >= 0 && !after.slice(0, close).includes("[[")) after = after.slice(0, close) + after.slice(close + 2);
  }
  const clean = (fragment: string) => cleanForDisplay(fragment).replace(/==|~~/g, "");
  return {
    before: clean(before),
    after: [...clean(after)].slice(0, AFTER_CHARS).join("")
  };
}

const SENTENCE_END = /[。！？!?；;]/u;
/** 句末标点后面跟着的引号、括号仍属上一句 */
const CLOSERS = /^[”’」』）》〉\])\s]+/u;

/**
 * 一条结果显示成一行：命中之前从本句开头起，最多留 maxBefore 个字（截掉了前半句就以「…」开头）；
 * 命中之后的上下文原样留着。BookxNote 是从命中所在那一行的行首显示；正文一个自然段是一整行，所以改按句子。
 */
export function rowParts(hit: { before: string; match: string; after: string }, maxBefore = BEFORE_CHARS): RowParts {
  let chars = [...hit.before];
  for (let i = chars.length - 1; i >= 0; i--) {
    if (SENTENCE_END.test(chars[i])) {
      chars = chars.slice(i + 1);
      break;
    }
  }
  let before = chars.join("").replace(CLOSERS, "").trimStart();
  const kept = [...before];
  if (kept.length > maxBefore) before = `…${kept.slice(-maxBefore).join("")}`;
  return { before, match: hit.match, after: hit.after.trimEnd() };
}

/** 从 offset（光标或屏幕顶端）往后的第一处；后面没有了就回到第一处 */
export function startIndex(hits: ReadonlyArray<{ from: number }>, offset: number): number {
  if (!hits.length) return -1;
  const index = hits.findIndex((hit) => hit.from >= offset);
  return index < 0 ? 0 : index;
}

/** 上一处（delta = -1）或下一处（delta = 1），到头循环 */
export function stepIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return delta > 0 ? 0 : length - 1;
  return (current + delta + length) % length;
}

/** 正文改动后重搜：离原来那处最近的一处接着当「当前」 */
export function nearestIndex(hits: ReadonlyArray<{ from: number }>, from: number): number {
  let best = -1;
  let distance = Infinity;
  hits.forEach((hit, index) => {
    const d = Math.abs(hit.from - from);
    if (d < distance) {
      distance = d;
      best = index;
    }
  });
  return best;
}

export interface Band {
  top: number;
  bottom: number;
}

/** 面板正下方留出的距离上限：命中落在面板底下不远处，前文还看得见 */
const BELOW_PANEL = 96;
/** 空档不足这么高时不再躲面板 */
const MIN_BAND = 60;

/**
 * 跳到一处命中后，它该落在屏幕的哪个高度（与 view、panel 同一坐标系）。
 * 面板浮在正文上：不挡时落在正中；挡着时落到面板下方（下方空档大）或上方空档的正中。
 */
export function landingY(view: Band, panel: Band | null): number {
  const middle = (view.top + view.bottom) / 2;
  if (!panel || panel.bottom <= view.top || panel.top >= view.bottom) return middle;
  const above = Math.max(0, Math.min(panel.top, view.bottom) - view.top);
  const below = Math.max(0, view.bottom - Math.max(panel.bottom, view.top));
  if (Math.max(above, below) < MIN_BAND) return middle;
  if (below >= above) return view.bottom - below + Math.min(below / 2, BELOW_PANEL);
  return view.top + above / 2;
}

/** 状态栏文字：「3 / 12 处」「12 处」「没有找到」；列满了注明只列了前几处 */
export function statusText(count: number, current: number, capped: boolean, hasQuery: boolean): string {
  if (!hasQuery) return "";
  if (!count) return t("status.none");
  const total = capped ? t("n.firstMatches", { n: count }) : matchesLabel(count);
  return current >= 0 ? `${current + 1} / ${total}` : total;
}
