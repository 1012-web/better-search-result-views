/**
 * Markdown 原文工具（纯函数，不依赖 obsidian，手机端也可用）。
 */

/** 换行归一成 \n：偏移要和编辑器里一致 */
export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** frontmatter 结束的位置（不存在时为 0）；闭合行可写 --- 或 ...，允许行尾空白 */
export function frontmatterEnd(text: string): number {
  const open = /^---[ \t]*\r?\n/.exec(text);
  if (!open) return 0;
  const close = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;
  let pos = open[0].length;
  while (pos <= text.length) {
    const lineEnd = text.indexOf("\n", pos);
    const line = text.slice(pos, lineEnd < 0 ? text.length : lineEnd + 1);
    if (close.test(line)) return pos + line.length;
    if (lineEnd < 0) return 0;
    pos = lineEnd + 1;
  }
  return 0;
}

/** 代码围栏（``` 与 ~~~，允许缩进、引用、列表前缀）的区间；未闭合的围栏延伸到文末 */
export function fencedRanges(text: string, start = 0): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const fence = /^[ \t>]*(?:(?:[-+*]|\d+[.)])[ \t]+)?(`{3,}|~{3,})/;
  let open: { char: string; size: number; from: number } | null = null;
  let pos = start;
  while (pos < text.length) {
    const lineEnd = text.indexOf("\n", pos);
    const end = lineEnd < 0 ? text.length : lineEnd + 1;
    const match = fence.exec(text.slice(pos, end));
    if (match) {
      const run = match[1];
      if (!open) {
        open = { char: run[0], size: run.length, from: pos };
      } else if (run[0] === open.char && run.length >= open.size && /^\s*$/.test(text.slice(pos + match[0].length, end))) {
        ranges.push([open.from, end]);
        open = null;
      }
    }
    pos = end;
  }
  if (open) ranges.push([open.from, text.length]);
  return ranges;
}

export interface LinkParts {
  /** 目标笔记部分（不含 #标题），可能为空（本篇内的 [[#标题]]） */
  linkpath: string;
  /** # 之后的部分（标题或 ^块） */
  subpath: string;
  /** `|` 之后的显示文字；没写时为 null */
  display: string | null;
}

/** 拆开 [[…]] 里面的内容 */
export function parseLinkInner(inner: string): LinkParts {
  let target = inner;
  let display: string | null = null;
  const pipe = inner.indexOf("|");
  if (pipe >= 0) {
    // 表格里的链接写成 [[目标\|文字]]
    target = inner.slice(0, pipe).replace(/\\$/, "");
    display = inner.slice(pipe + 1);
  }
  const hash = target.indexOf("#");
  const linkpath = (hash >= 0 ? target.slice(0, hash) : target).trim();
  const subpath = hash >= 0 ? target.slice(hash + 1).trim() : "";
  return { linkpath, subpath, display };
}

/** 每行起点的偏移 */
export function computeLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** 行号索引：offset → line。starts 公开，阅读模式按段落换算原文区间时要用到行数 */
export class LineIndex {
  readonly starts: number[];
  constructor(text: string) {
    this.starts = computeLineStarts(text);
  }
  lineAt(offset: number): number {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low;
  }
  lineStart(line: number): number {
    return this.starts[Math.max(0, Math.min(line, this.starts.length - 1))];
  }
}

/**
 * 正文里的 <!--p.N--> 印刷页标记，按出现先后（古籍、整理本转写时用来记原书页码）。
 * N 可为负（卷首没有印刷页码时）。容许注释里多空格。
 */
export function pageMarkers(text: string): Array<{ offset: number; page: number }> {
  return Array.from(text.matchAll(/<!--\s*p\.(-?\d+)\s*-->/g), (match) => ({ offset: match.index ?? 0, page: Number(match[1]) }));
}
