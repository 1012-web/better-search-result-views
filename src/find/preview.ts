/**
 * 阅读模式下把命中标在渲染出来的正文上。用浏览器的 CSS Custom Highlight 接口：只登记文字范围、不改 DOM，
 * 不会惊动 Obsidian 的渲染。阅读视图只渲染屏幕附近的几段，滚动后新渲染出来的段落由观察器补标。
 *
 * 渲染后的文字与原文对不上偏移（标签、页码锚点、Markdown 记号都没了），所以在每一段渲染出来的文字上
 * 用同一套检索规则再找一遍；「当前那处」按它是本段的第几处来对应。
 *
 * 编辑模式（实时预览）也用得上：标注的 <mark>…</mark> 在光标不在那一行时被 Obsidian 换成 HTML 小部件，
 * 编辑器的装饰标不进小部件里面，于是小部件里的命中同样用这个接口标（surface 为 widgets）。
 */
import type { MarkdownView } from "obsidian";
import type { VariantTable } from "../shared/variants";
import { searchText, type Hit, type SearchOptions } from "../variants/search";

/** 样式表里 ::highlight(…) 用的名字 */
export const HIGHLIGHT_ALL = "hist-search-find";
export const HIGHLIGHT_CURRENT = "hist-search-find-current";

/** 渲染出来但不属于正文的文字：名词模块挂的外文名、属性区、折叠箭头、代码块的复制按钮、脚注号 */
const SKIP = ".note1012-term-foreign, .frontmatter, .frontmatter-container, .metadata-container, .collapse-indicator, .copy-code-button, sup.footnote-ref, .footnote-backref";

const REMARK_DELAY = 60;

export interface PreviewQuery {
  query: string;
  options: SearchOptions;
  table: VariantTable | null;
  hits: ReadonlyArray<Hit>;
  /** hits 里当前那处的下标；没有时为 -1 */
  current: number;
}

/** 阅读视图渲染出来的一段（内部接口）。新版记起止位置，旧版记行号，两种都认 */
interface PreviewSection {
  el?: HTMLElement;
  start?: { line?: number; offset?: number };
  end?: { line?: number; offset?: number };
  lineStart?: number;
  lineEnd?: number;
}

/** 这一段占原文的第几行到第几行（含）；开头那个不对应任何原文的空段（文内标题等）不算 */
function sectionLines(section: PreviewSection): [number, number] | null {
  const from = section.start?.line;
  const to = section.end?.line;
  if (typeof from === "number" && typeof to === "number") {
    const empty = typeof section.start?.offset === "number" && section.start.offset === section.end?.offset;
    return empty ? null : [from, to];
  }
  if (typeof section.lineStart === "number" && typeof section.lineEnd === "number") return [section.lineStart, section.lineEnd];
  return null;
}

interface RendererLike {
  sections?: PreviewSection[];
  sizerEl?: HTMLElement;
  previewEl?: HTMLElement;
}

function rendererOf(view: MarkdownView): RendererLike | null {
  return (view.previewMode as unknown as { renderer?: RendererLike }).renderer ?? null;
}

/** 阅读视图里真正滚动的那个元素 */
export function previewScroller(view: MarkdownView): HTMLElement | null {
  return rendererOf(view)?.previewEl ?? view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-view");
}

/**
 * 拼接文本里的偏移 → 第几个文字节点、节点内偏移。starts[i] 是第 i 个节点在拼接文本里的起点（递增）。
 * 落在两个节点交界处时：起点算后一个节点的开头，终点算前一个节点的末尾，免得范围多带一个空节点。
 */
export function locateInNodes(starts: ReadonlyArray<number>, offset: number, end: boolean): { node: number; offset: number } {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (end ? starts[mid] < offset : starts[mid] <= offset) low = mid;
    else high = mid - 1;
  }
  return { node: low, offset: offset - starts[low] };
}

function textNodes(el: HTMLElement): Text[] {
  const walker = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest(SKIP)) continue;
    out.push(node as Text);
  }
  return out;
}

/** 一段渲染出来的文字里的全部命中，按出现先后 */
function rangesIn(el: HTMLElement, spec: PreviewQuery): Range[] {
  const nodes = textNodes(el);
  if (!nodes.length) return [];
  const starts: number[] = [];
  let text = "";
  for (const node of nodes) {
    starts.push(text.length);
    text += node.data;
  }
  const found = searchText({ text, query: spec.query, options: spec.options, table: spec.table });
  return found.map((hit) => {
    const from = locateInNodes(starts, hit.from, false);
    const to = locateInNodes(starts, hit.to, true);
    const range = el.ownerDocument.createRange();
    range.setStart(nodes[from.node], from.offset);
    range.setEnd(nodes[to.node], to.offset);
    return range;
  });
}

interface Marks {
  all: Range[];
  current: Range | null;
}

interface HighlightLike {
  add(range: Range): unknown;
  priority: number;
}

interface HighlightApi {
  registry: { set(name: string, highlight: HighlightLike): unknown; delete(name: string): unknown };
  create(): HighlightLike;
}

/** 每个系统窗口（主窗口、各弹出窗口）各有一份登记表，接口要从那个窗口上取 */
function highlightApi(win: Window): HighlightApi | null {
  const w = win as unknown as { CSS?: { highlights?: HighlightApi["registry"] }; Highlight?: new () => HighlightLike };
  const registry = w.CSS?.highlights;
  const Ctor = w.Highlight;
  if (!registry || !Ctor) return null;
  return { registry, create: () => new Ctor() };
}

/** 同一个窗口里可能并排开着几篇、各有各的面板：名字只有一组，各面板的范围合在一起登记 */
const owners = new Map<Window, Map<object, Marks>>();

function setMarks(win: Window, owner: object, marks: Marks | null): void {
  let map = owners.get(win);
  if (!map) {
    if (!marks) return;
    map = new Map();
    owners.set(win, map);
  }
  if (marks) map.set(owner, marks);
  else map.delete(owner);
  const api = highlightApi(win);
  if (api) {
    const all = api.create();
    const current = api.create();
    current.priority = 1;
    let any = false;
    let anyCurrent = false;
    for (const entry of map.values()) {
      for (const range of entry.all) {
        all.add(range);
        any = true;
      }
      if (entry.current) {
        current.add(entry.current);
        anyCurrent = true;
      }
    }
    if (any) api.registry.set(HIGHLIGHT_ALL, all);
    else api.registry.delete(HIGHLIGHT_ALL);
    if (anyCurrent) api.registry.set(HIGHLIGHT_CURRENT, current);
    else api.registry.delete(HIGHLIGHT_CURRENT);
  }
  if (!map.size) owners.delete(win);
}

/** preview：阅读视图的各段；widgets：实时预览里的 HTML 小部件（只标全部命中，「当前那处」由编辑器的选区与装饰显示） */
export type Surface = "preview" | "widgets";

export class PreviewMarker {
  private spec: PreviewQuery | null = null;
  private surface: Surface = "preview";
  private observer: MutationObserver | null = null;
  private observed: HTMLElement | null = null;
  private timer: number | null = null;
  private timerWin: Window | null = null;
  private win: Window | null = null;
  private currentRange: Range | null = null;

  constructor(private readonly view: MarkdownView) {}

  /** 换一批命中；null 表示清掉并停止观察 */
  set(spec: PreviewQuery | null, surface: Surface = "preview"): void {
    this.surface = surface;
    this.spec = spec && spec.hits.length ? spec : null;
    if (!this.spec) {
      this.stop();
      this.clear();
      return;
    }
    this.watch();
    this.mark();
  }

  /** 按现在渲染出来的段落重标一遍（滚动后新渲染的段落） */
  refresh(): void {
    if (this.spec) this.mark();
  }

  /** 当前那处在屏幕上的位置；它所在的段落还没渲染出来时为 null */
  currentRect(): DOMRect | null {
    const range = this.currentRange;
    if (!range || !range.startContainer.isConnected) return null;
    const rect = range.getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }

  dispose(): void {
    this.spec = null;
    this.stop();
    this.clear();
  }

  private clear(): void {
    this.currentRange = null;
    if (this.win) setMarks(this.win, this, null);
    this.win = null;
  }

  private stop(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.observed = null;
    if (this.timer !== null) this.timerWin?.clearTimeout(this.timer);
    this.timer = null;
    this.timerWin = null;
  }

  private watch(): void {
    const target = this.surface === "widgets"
      ? this.editorContent()
      : rendererOf(this.view)?.sizerEl ?? this.view.previewMode.containerEl;
    if (!target) {
      this.stop();
      return;
    }
    if (this.observer && this.observed === target) return;
    this.observer?.disconnect();
    this.observed = target;
    this.observer = new MutationObserver(() => {
      if (this.timer !== null) return;
      const win = this.view.containerEl.win;
      this.timerWin = win;
      this.timer = win.setTimeout(() => {
        this.timer = null;
        this.refresh();
      }, REMARK_DELAY);
    });
    this.observer.observe(target, { childList: true, subtree: true, characterData: true });
  }

  private editorContent(): HTMLElement | null {
    return this.view.contentEl.querySelector<HTMLElement>(".markdown-source-view .cm-content");
  }

  /** 已渲染出来的各段；拿不到内部的分段信息时退为正文容器的各个子元素 */
  private blocks(): HTMLElement[] {
    if (this.surface === "widgets") return Array.from(this.editorContent()?.querySelectorAll<HTMLElement>(".cm-html-embed") ?? []);
    const renderer = rendererOf(this.view);
    const sections = renderer?.sections;
    if (sections?.length) return sections.map((section) => section.el).filter((el): el is HTMLElement => !!el && el.isConnected);
    const sizer = renderer?.sizerEl ?? this.view.previewMode.containerEl.querySelector<HTMLElement>(".markdown-preview-sizer");
    return sizer ? (Array.from(sizer.children) as HTMLElement[]) : [];
  }

  /** 当前那处在哪一段、是这一段里的第几处（按原文行号对应到渲染出来的段落） */
  private currentTarget(spec: PreviewQuery): { el: HTMLElement; nth: number } | null {
    const hit = spec.hits[spec.current];
    if (!hit) return null;
    for (const section of rendererOf(this.view)?.sections ?? []) {
      const lines = sectionLines(section);
      if (!lines || hit.line < lines[0] || hit.line > lines[1]) continue;
      if (!section.el?.isConnected) return null;
      let nth = 0;
      for (let i = spec.current - 1; i >= 0 && spec.hits[i].line >= lines[0]; i--) nth++;
      return { el: section.el, nth };
    }
    return null;
  }

  private mark(): void {
    const spec = this.spec;
    if (!spec) return;
    const win = this.view.containerEl.win;
    // 视图被挪到了另一个系统窗口：旧窗口里登记的先清掉
    if (this.win && this.win !== win) setMarks(this.win, this, null);
    this.win = win;
    const target = this.surface === "preview" ? this.currentTarget(spec) : null;
    const all: Range[] = [];
    let current: Range | null = null;
    try {
      for (const el of this.blocks()) {
        const ranges = rangesIn(el, spec);
        for (const range of ranges) all.push(range);
        if (target && target.el === el) current = ranges[target.nth] ?? null;
      }
    } catch (error) {
      // 内部结构变了、对不上：不标，查找与跳转照常
      console.error("[hist-search] 阅读模式标出命中时出错", error);
    }
    this.currentRange = current;
    setMarks(win, this, { all, current });
  }
}
