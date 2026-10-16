/**
 * 异体字检索的主体（纯函数，不依赖 obsidian，便于测试，手机端也可用）。
 *
 * 做法：先把正文切成「可比对的字」序列，每个字记着它在原文里的起止偏移（UTF-16，与编辑器一致）；
 * 标签、注释、页码锚点、折行等按勾选项或跳过、或当作断点（断点两边不能连成一个词）。
 * 查询也照同样规则切开，再按异体折叠表逐字比对。命中后用偏移回到原文取上下文、页码与所属条目。
 */
import { normalizeChar } from "../shared/normalize";
import { LineIndex, frontmatterEnd, pageMarkers } from "../shared/markdown";
import type { VariantTable } from "../shared/variants";

export interface SearchOptions {
  /** 异体字等同（按折叠表） */
  variants: boolean;
  /** 跨页码锚点 <!--p.N--> 与折行 */
  crossAnchors: boolean;
  /** 跨标注标签、%%注释%%、其他 HTML 注释与脚注号 */
  crossMarkup: boolean;
  /** 忽略标点 */
  ignorePunct: boolean;
  /** 只搜标题行（书目条目） */
  titlesOnly: boolean;
}

export const DEFAULT_SEARCH_OPTIONS: SearchOptions = {
  variants: true,
  crossAnchors: true,
  crossMarkup: true,
  ignorePunct: false,
  titlesOnly: false
};

/** 一处存疑的字：原文 [from, to) 的另几种读法。插件自己不产生，留给别的插件通过接口提供 */
export interface Candidate {
  from: number;
  to: number;
  values: string[];
}

/** 标题链上的一环：标题文字，加上它在原文里的起点（同名标题靠它区分） */
export interface TrailItem {
  title: string;
  from: number;
  /** 几级标题（# 的个数，1 到 6） */
  level: number;
}

export interface Hit {
  from: number;
  to: number;
  /** 0 起的行号 */
  line: number;
  /** 最近的 <!--p.N--> 印刷页码；前面没有锚点时为 null */
  page: number | null;
  /** 所属的最近一个标题（书目条目名），没有时为 null */
  entry: string | null;
  /** 所属标题链：从最外层到最近的标题；没有标题时为空数组 */
  trail: TrailItem[];
  /** 命中所在段落里，命中之前、之后的文字（已清理；过长时截断，截断处以「…」标出） */
  blockBefore: string;
  blockAfter: string;
  /** 与上一处命中同在一个段落、且相隔不远时，两处之间的文字；否则为 null（树形显示据此把它们并成一张卡片） */
  joinGap: string | null;
  /** 显示用的上下文（去掉了标签、注释与 Markdown 记号） */
  before: string;
  match: string;
  after: string;
  /** 这处命中用到了存疑字的另一种读法 */
  viaCandidate: boolean;
}

/** 断点：不与任何字相等 */
const BARRIER = "\u0000";
const PAGE_ANCHOR = /^<!--\s*p\.-?\d+\s*-->$/;
/** Markdown 记号：比对时不算字（与标注模块的归一化一致） */
const MARKDOWN_SIGNS = new Set(["*", "_", "~", "=", "`", "#", ">", "|"]);
const PUNCT = /[\p{P}\p{S}]/u;

export interface Tokens {
  /** 每个可比对单位的字（已做全半角、大小写归一）；断点为 BARRIER */
  chars: string[];
  from: Int32Array;
  to: Int32Array;
}

interface Span {
  from: number;
  to: number;
  /** skip：整段跳过；barrier：跳过但两边不能相连 */
  kind: "skip" | "barrier";
}

/** 要特殊处理的原文区间：注释、标签、脚注号、双链记号 */
function markupSpans(text: string, options: SearchOptions): Span[] {
  const spans: Span[] = [];
  const markupKind = options.crossMarkup ? "skip" : "barrier";
  for (const m of text.matchAll(/<!--[\s\S]*?-->/g)) {
    const kind = PAGE_ANCHOR.test(m[0]) ? (options.crossAnchors ? "skip" : "barrier") : markupKind;
    spans.push({ from: m.index, to: m.index + m[0].length, kind });
  }
  for (const re of [/%%[\s\S]*?%%/g, /<\/?[a-zA-Z][^<>]*>/g, /\[\^[^\]]+\]/g, /\^\[[^\]]*\]/g]) {
    for (const m of text.matchAll(re)) spans.push({ from: m.index, to: m.index + m[0].length, kind: markupKind });
  }
  // [[目标|别名]] 只比对别名；[[目标]] 比对目标：括号与「目标|」跳过
  for (const m of text.matchAll(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g)) {
    const start = m.index;
    const end = start + m[0].length;
    if (m[2] !== undefined) {
      const aliasStart = start + 2 + m[1].length + 1;
      spans.push({ from: start, to: aliasStart, kind: "skip" }, { from: aliasStart + m[2].length, to: end, kind: "skip" });
    } else {
      spans.push({ from: start, to: start + 2, kind: "skip" }, { from: end - 2, to: end, kind: "skip" });
    }
  }
  return spans.sort((a, b) => a.from - b.from || b.to - a.to);
}

/** 正文 → 可比对单位序列（frontmatter 不参与） */
export function tokenize(text: string, options: SearchOptions): Tokens {
  const chars: string[] = [];
  const from: number[] = [];
  const to: number[] = [];
  // 断点也记原文位置（断点所在处不会有字），保证 from 数组递增，查疑字时可以二分
  const barrier = (at: number) => {
    if (chars.length && chars[chars.length - 1] !== BARRIER) {
      chars.push(BARRIER);
      from.push(at);
      to.push(at);
    }
  };
  const spans = markupSpans(text, options);
  let spanIndex = 0;
  let i = frontmatterEnd(text);
  while (i < text.length) {
    // 进入特殊区间：整段跳过或记一个断点
    while (spanIndex < spans.length && spans[spanIndex].to <= i) spanIndex++;
    const span = spanIndex < spans.length && spans[spanIndex].from <= i ? spans[spanIndex] : null;
    if (span) {
      if (span.kind === "barrier") barrier(span.from);
      i = span.to;
      continue;
    }
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const width = ch.length;
    if (ch === "\n" || ch === "\r") {
      if (!options.crossAnchors) barrier(i);
    } else if (/\s/u.test(ch) || MARKDOWN_SIGNS.has(ch)) {
      // 空白与 Markdown 记号不算字
    } else {
      for (const unit of [...normalizeChar(ch)]) {
        if (/\s/u.test(unit)) continue;
        if (options.ignorePunct && PUNCT.test(unit)) continue;
        chars.push(unit);
        from.push(i);
        to.push(i + width);
      }
    }
    i += width;
  }
  return { chars, from: Int32Array.from(from), to: Int32Array.from(to) };
}

/** 查询 → 要比对的字（与正文同样归一；空白、Markdown 记号去掉，忽略标点时标点也去掉） */
export function queryChars(query: string, options: SearchOptions): string[] {
  const out: string[] = [];
  for (const ch of query) {
    if (/\s/u.test(ch) || MARKDOWN_SIGNS.has(ch)) continue;
    for (const unit of [...normalizeChar(ch)]) {
      if (/\s/u.test(unit)) continue;
      if (options.ignorePunct && PUNCT.test(unit)) continue;
      out.push(unit);
    }
  }
  return out;
}

/** 显示用：去掉注释、标签、脚注号与 Markdown 记号，折行换成空格 */
export function cleanForDisplay(fragment: string): string {
  return fragment
    .replace(/<!--[\s\S]*?(?:-->|$)/g, "")
    .replace(/%%[\s\S]*?(?:%%|$)/g, "")
    .replace(/<\/?[a-zA-Z][^<>]*>/g, "")
    .replace(/\[\^[^\]]+\]/g, "")
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/\s*\n\s*/g, " ");
}

const CONTEXT_CHARS = 20;

function contextBefore(text: string, from: number): string {
  const raw = cleanForDisplay(text.slice(Math.max(0, from - CONTEXT_CHARS * 4), from));
  return [...raw].slice(-CONTEXT_CHARS).join("");
}

function contextAfter(text: string, to: number): string {
  const raw = cleanForDisplay(text.slice(to, to + CONTEXT_CHARS * 4));
  return [...raw].slice(0, CONTEXT_CHARS).join("");
}

const BLOCK_BEFORE_CHARS = 120;
const BLOCK_AFTER_CHARS = 160;
/** 同一段里两处命中相隔不超过这么多字，就并成一张卡片显示 */
const JOIN_GAP_CHARS = 60;

const HAN = /\p{Script=Han}/u;

/** 命中紧挨着汉字时，折行留下的空白一并去掉（折行在中文里不该显示成空格） */
function trimNextToHan(fragment: string, neighbour: string, side: "start" | "end"): string {
  if (!HAN.test(neighbour)) return fragment;
  return side === "start" ? fragment.trimStart() : fragment.trimEnd();
}

/** 中文行与行之间的折行不该留空格：两个汉字（或全角标点）之间只隔着空白的，把空白去掉 */
function tidyBlock(cleaned: string): string {
  return cleaned.replace(/(\p{Script=Han}|[，。；：？！、」』）》”’])\s+(?=\p{Script=Han}|[，。；：？！、「『（《“‘])/gu, "$1");
}

/** 命中所在段落（以空行为界）里，命中前后的文字；过长时各自截断 */
function blockContext(text: string, from: number, to: number): { before: string; after: string } {
  const startAt = text.lastIndexOf("\n\n", from);
  const blockStart = startAt < 0 ? 0 : startAt + 2;
  const endAt = text.indexOf("\n\n", to);
  const blockEnd = endAt < 0 ? text.length : endAt;
  const before = [...trimNextToHan(tidyBlock(cleanForDisplay(text.slice(blockStart, from))), text.charAt(from), "end").trimStart()];
  const after = [...trimNextToHan(tidyBlock(cleanForDisplay(text.slice(to, blockEnd))), text.charAt(to - 1), "start").trimEnd()];
  return {
    before: before.length > BLOCK_BEFORE_CHARS ? `…${before.slice(-BLOCK_BEFORE_CHARS).join("")}` : before.join(""),
    after: after.length > BLOCK_AFTER_CHARS ? `${after.slice(0, BLOCK_AFTER_CHARS).join("")}…` : after.join("")
  };
}

interface Heading {
  from: number;
  to: number;
  title: string;
  level: number;
}

function headings(text: string): Heading[] {
  const out: Heading[] = [];
  for (const m of text.matchAll(/^(#{1,6})[ \t]+(.*)$/gm)) {
    out.push({ from: m.index, to: m.index + m[0].length, title: cleanForDisplay(m[2]).trim(), level: m[1].length });
  }
  return out;
}

/** 每个标题的标题链：它自己加上一路往外的上级（比它层级浅、且离它最近的那些标题） */
function headingTrails(heads: Heading[]): TrailItem[][] {
  const stack: Heading[] = [];
  return heads.map((heading) => {
    while (stack.length && stack[stack.length - 1].level >= heading.level) stack.pop();
    stack.push(heading);
    return stack.map((item) => ({ title: item.title, from: item.from, level: item.level }));
  });
}

/** 有序标题表里最后一个起点 ≤ offset 的下标；没有时 -1 */
function headingIndexAt(heads: Heading[], offset: number): number {
  let low = 0;
  let high = heads.length - 1;
  let found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (heads[mid].from <= offset) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

/** 一篇正文的标题索引：问某个位置落在哪条标题链下（给 Obsidian 自带搜索的结果加树形用，纯函数） */
export interface HeadingIndex {
  trailAt(offset: number): TrailItem[];
}

export function buildHeadingIndex(text: string): HeadingIndex {
  const heads = headings(text);
  const trails = headingTrails(heads);
  return {
    trailAt(offset: number): TrailItem[] {
      const index = headingIndexAt(heads, offset);
      return index >= 0 ? trails[index] : [];
    }
  };
}

/** 有序数组里最后一个 key ≤ offset 的元素 */
function lastAtOrBefore<T>(items: T[], offset: number, key: (item: T) => number): T | null {
  let low = 0;
  let high = items.length - 1;
  let found: T | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (key(items[mid]) <= offset) {
      found = items[mid];
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

export interface SearchInput {
  text: string;
  query: string;
  options: SearchOptions;
  table: VariantTable | null;
  /** 这个文件里存疑字的另几种读法；有就按它们也算命中 */
  candidates?: Candidate[] | null;
  /** 已切好的单位序列（同一文件、同一组影响切分的选项时可复用） */
  tokens?: Tokens;
  /** 最多返回几处 */
  limit?: number;
}

/**
 * 在一篇正文里找查询的所有命中（互不重叠，按出现先后）。
 * 正文应是换行已归一（只有 \n）的磁盘文本，偏移才与编辑器一致。
 */
export function searchText(input: SearchInput): Hit[] {
  const { text, options } = input;
  const q = queryChars(input.query, options);
  if (!q.length) return [];
  const tokens = input.tokens ?? tokenize(text, options);
  const table = options.variants && input.table && !input.table.empty ? input.table : null;
  const fold = (ch: string) => (table ? table.rep(ch) : ch);
  const qk = q.map(fold);
  const keys = tokens.chars.map((ch) => (ch === BARRIER ? BARRIER : fold(ch)));

  // 疑字：单位下标 → 另几读折叠后的字
  const alternates = new Map<number, Set<string>>();
  if (input.candidates?.length) {
    const starts = tokens.from;
    for (const candidate of input.candidates) {
      const index = lowerBound(starts, candidate.from);
      if (index >= starts.length || starts[index] !== candidate.from) continue;
      const set = alternates.get(index) ?? new Set<string>();
      for (const value of candidate.values) {
        const first = [...normalizeChar(value)][0];
        if (first) set.add(fold(first));
      }
      alternates.set(index, set);
    }
  }

  const titleRanges = options.titlesOnly ? headings(text) : null;
  const anchors = pageMarkers(text);
  const heads = titleRanges ?? headings(text);
  const trails = headingTrails(heads);
  const lines = new LineIndex(text);
  const limit = input.limit ?? Infinity;
  const hits: Hit[] = [];

  for (let i = 0; i + qk.length <= keys.length && hits.length < limit; i++) {
    let viaCandidate = false;
    let ok = true;
    for (let j = 0; j < qk.length; j++) {
      const key = keys[i + j];
      if (key === qk[j]) continue;
      if (key !== BARRIER && alternates.get(i + j)?.has(qk[j])) {
        viaCandidate = true;
        continue;
      }
      ok = false;
      break;
    }
    if (!ok) continue;
    const from = tokens.from[i];
    const to = tokens.to[i + qk.length - 1];
    if (titleRanges) {
      const heading = lastAtOrBefore(titleRanges, from, (h) => h.from);
      if (!heading || to > heading.to) continue;
    }
    const headIndex = headingIndexAt(heads, from);
    const block = blockContext(text, from, to);
    const previousHit = hits[hits.length - 1];
    let joinGap: string | null = null;
    if (previousHit) {
      const raw = text.slice(previousHit.to, from);
      if (!raw.includes("\n\n")) {
        const gap = trimNextToHan(trimNextToHan(tidyBlock(cleanForDisplay(raw)), text.charAt(from), "end"), text.charAt(previousHit.to - 1), "start");
        if ([...gap].length <= JOIN_GAP_CHARS) joinGap = gap;
      }
    }
    hits.push({
      joinGap,
      from,
      to,
      line: lines.lineAt(from),
      page: lastAtOrBefore(anchors, from, (a) => a.offset)?.page ?? null,
      entry: headIndex >= 0 ? heads[headIndex].title : null,
      trail: headIndex >= 0 ? trails[headIndex] : [],
      blockBefore: block.before,
      blockAfter: block.after,
      before: contextBefore(text, from),
      match: cleanForDisplay(text.slice(from, to)),
      after: contextAfter(text, to),
      viaCandidate
    });
    i += qk.length - 1;
  }
  return hits;
}

function lowerBound(values: Int32Array, target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** 影响切分的选项：这几项相同，同一文件的切分结果可以复用 */
export function tokenizeKey(options: SearchOptions): string {
  return `${options.crossAnchors ? 1 : 0}${options.crossMarkup ? 1 : 0}${options.ignorePunct ? 1 : 0}`;
}
