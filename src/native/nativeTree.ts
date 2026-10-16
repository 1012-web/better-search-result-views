/**
 * 给 Obsidian 自带搜索的结果加上标题分层（实验性，默认关闭）。
 *
 * 做法：不改自带搜索的匹配与渲染，只在每条结果（一处命中的上下文）前补出标题行，
 * 并按标题层级缩进；点标题行折叠或展开它下面的结果。标题链由命中位置和文件全文算出，
 * 折叠时借用自带无限滚动容器的 info.hidden 标记把结果从布局里拿掉。
 *
 * 读的是自带搜索视图的内部字段（没有公开类型）：dom.vChildren._children 是各文件，
 * 文件上的 content 是全文、vChildren._children 是各条结果，结果上的 start 是位置、el 是元素。
 * 任何一处对不上或出错，就整个撤销并停用，不影响别的功能。
 */
import type { App, WorkspaceLeaf } from "obsidian";
import { buildHeadingIndex, type HeadingIndex } from "../variants/search";
import { planMatches, visibilityOf, type MatchPlan } from "./plan";

interface MatchItem {
  start: number;
  el: HTMLElement;
  info?: { hidden?: boolean };
}

interface FileItem {
  file?: { path?: string };
  content?: string;
  childrenEl?: HTMLElement;
  vChildren?: { _children?: MatchItem[] };
}

interface SearchDom {
  el?: HTMLElement;
  vChildren?: { _children?: FileItem[] };
  infinityScroll?: { invalidate?: (item?: unknown, deep?: boolean) => void; invalidateAll?: () => void };
}

interface Attached {
  dom: SearchDom;
  observer: MutationObserver;
  frame: number | null;
}

/** 跨窗口也靠得住的元素判断（弹出窗口里的元素不是主窗口那个 HTMLElement 的实例） */
function isElement(value: unknown): value is HTMLElement {
  const candidate = value as { instanceOf?: (type: unknown) => boolean } | null | undefined;
  return !!candidate && typeof candidate.instanceOf === "function" && candidate.instanceOf(HTMLElement);
}

const ROWS_CLASS = "bsrv-sr-rows";
const BODY_CLASS = "bsrv-sr-body";

export class NativeSearchTree {
  private enabled = false;
  private broken = false;
  private readonly attached = new Map<WorkspaceLeaf, Attached>();
  /** 每个文件里被折叠的标题（标题在原文里的起点）。只记在内存里，关掉搜索面板就忘 */
  private readonly collapsed = new Map<string, Set<number>>();
  /** 被我们从布局里拿掉的结果：撤销时只放回这些，不碰自带搜索自己藏起来的 */
  private readonly hiddenByUs = new WeakSet<object>();
  private readonly indexCache = new WeakMap<FileItem, { content: string; index: HeadingIndex }>();

  constructor(private readonly app: App) {}

  /** 打开或关闭整个功能 */
  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.broken = false;
      this.sync();
    } else this.teardown();
  }

  /** 找到所有自带搜索面板并接上；面板关掉了就放手。布局变化时调用 */
  sync(): void {
    if (!this.enabled || this.broken) return;
    const leaves = this.app.workspace.getLeavesOfType("search");
    for (const leaf of leaves) {
      const dom = this.domOf(leaf);
      const existing = this.attached.get(leaf);
      if (existing && existing.dom !== dom) this.detach(leaf);
      if (dom?.el && !this.attached.has(leaf)) this.attach(leaf, dom);
    }
    for (const leaf of [...this.attached.keys()]) if (!leaves.includes(leaf)) this.detach(leaf);
  }

  private domOf(leaf: WorkspaceLeaf): SearchDom | null {
    const dom = (leaf.view as unknown as { dom?: SearchDom }).dom;
    return dom && typeof dom === "object" ? dom : null;
  }

  private attach(leaf: WorkspaceLeaf, dom: SearchDom): void {
    const state: Attached = { dom, observer: new MutationObserver(() => this.schedule(leaf)), frame: null };
    state.observer.observe(dom.el as HTMLElement, { childList: true, subtree: true });
    this.attached.set(leaf, state);
    this.schedule(leaf);
  }

  private detach(leaf: WorkspaceLeaf): void {
    const state = this.attached.get(leaf);
    if (!state) return;
    state.observer.disconnect();
    if (state.frame !== null) window.cancelAnimationFrame(state.frame);
    this.attached.delete(leaf);
  }

  private schedule(leaf: WorkspaceLeaf): void {
    const state = this.attached.get(leaf);
    if (!state || state.frame !== null) return;
    state.frame = window.requestAnimationFrame(() => {
      state.frame = null;
      this.run(leaf);
    });
  }

  private run(leaf: WorkspaceLeaf): void {
    const state = this.attached.get(leaf);
    if (!state || !this.enabled || this.broken) return;
    try {
      const files = state.dom.vChildren?._children;
      if (!Array.isArray(files)) return;
      for (const file of files) this.decorateFile(state.dom, file, leaf);
    } catch (error) {
      console.error("[bsrv] Tree view for Obsidian search failed and was turned off", error);
      this.broken = true;
      this.teardown();
    }
  }

  private headingIndex(file: FileItem, content: string): HeadingIndex {
    const cached = this.indexCache.get(file);
    if (cached && cached.content === content) return cached.index;
    const index = buildHeadingIndex(content);
    this.indexCache.set(file, { content, index });
    return index;
  }

  private decorateFile(dom: SearchDom, file: FileItem, leaf: WorkspaceLeaf): void {
    const content = file.content;
    const children = file.vChildren?._children;
    if (typeof content !== "string" || !Array.isArray(children)) return;
    const matches = children.filter((item) => typeof item.start === "number" && isElement(item.el));
    if (!matches.length) return;
    if (isElement(file.childrenEl) && !file.childrenEl.classList.contains("bsrv-sr-wrap")) file.childrenEl.classList.add("bsrv-sr-wrap");
    const index = this.headingIndex(file, content);
    const plans = planMatches(matches.map((item) => index.trailAt(item.start)));
    const path = file.file?.path ?? "";
    const collapsed = this.collapsed.get(path) ?? new Set<number>();
    matches.forEach((item, position) => this.decorateMatch(dom, item, plans[position], collapsed, path, leaf));
  }

  private decorateMatch(dom: SearchDom, item: MatchItem, plan: MatchPlan, collapsed: ReadonlySet<number>, path: string, leaf: WorkspaceLeaf): void {
    const el = item.el;
    let changed = false;
    const signature = `${plan.trail.length}|${plan.rows.map((row) => row.item.from).join(",")}`;
    let rows = el.querySelector<HTMLElement>(`:scope > .${ROWS_CLASS}`);
    if (rows && rows.dataset.sig !== signature) {
      rows.remove();
      rows = null;
    }
    if (!rows && plan.rows.length) {
      rows = this.buildRows(plan, signature, path, leaf);
      el.prepend(rows);
      changed = true;
    }
    if (!el.classList.contains("bsrv-sr-match")) el.classList.add("bsrv-sr-match");
    el.style.setProperty("--bsrv-depth", String(plan.trail.length));
    if (this.wrapBody(el, rows)) changed = true;

    const visibility = visibilityOf(plan, collapsed);
    rows?.querySelectorAll<HTMLElement>(".bsrv-sr-node").forEach((node, position) => {
      node.toggleClass("is-hidden", !visibility.rows[position]);
      node.toggleClass("is-collapsed", collapsed.has(plan.rows[position].item.from));
    });
    el.toggleClass("bsrv-sr-body-hidden", !visibility.body);
    el.toggleClass("bsrv-sr-gone", !visibility.any);

    const info = item.info;
    if (info) {
      const hide = !visibility.any;
      if (hide && !info.hidden) {
        info.hidden = true;
        this.hiddenByUs.add(item);
        changed = true;
      } else if (!hide && this.hiddenByUs.has(item)) {
        info.hidden = false;
        this.hiddenByUs.delete(item);
        changed = true;
      }
    }
    if (changed) dom.infinityScroll?.invalidate?.(item);
  }

  /**
   * 把自带搜索画在 el 里的内容（上下文文字、「显示更多」按钮等）装进一张独立的卡片里，
   * 标题行留在卡片外面。自带搜索重画这条结果时会先清空 el，这里下一轮会再装一次。返回这次是否动过 DOM。
   */
  private wrapBody(el: HTMLElement, rows: HTMLElement | null): boolean {
    let body = el.querySelector<HTMLElement>(`:scope > .${BODY_CLASS}`);
    const loose = Array.from(el.childNodes).filter((node) => node !== rows && node !== body);
    if (body && !loose.length) return false;
    if (!body) body = createDiv({ cls: BODY_CLASS });
    for (const node of loose) body.append(node);
    if (body.parentElement !== el) el.append(body);
    return true;
  }

  private buildRows(plan: MatchPlan, signature: string, path: string, leaf: WorkspaceLeaf): HTMLElement {
    const rows = createDiv({ cls: ROWS_CLASS });
    rows.dataset.sig = signature;
    for (const row of plan.rows) {
      const node = rows.createDiv({ cls: "bsrv-sr-node" });
      node.style.setProperty("--bsrv-row", String(row.depth));
      node.createSpan({ cls: "bsrv-sr-title", text: row.item.title });
      node.addEventListener("click", (event) => {
        // 点标题行只管折叠，不要让自带搜索当成点了这条结果而跳去打开文件
        event.stopPropagation();
        event.preventDefault();
        this.toggle(path, row.item.from, leaf);
      });
    }
    return rows;
  }

  private toggle(path: string, key: number, leaf: WorkspaceLeaf): void {
    const set = this.collapsed.get(path) ?? new Set<number>();
    if (!set.delete(key)) set.add(key);
    this.collapsed.set(path, set);
    this.schedule(leaf);
  }

  /** 撤销全部改动：去掉标题行、缩进、折叠，放回被我们拿掉的结果 */
  private teardown(): void {
    for (const [leaf, state] of [...this.attached]) {
      const files = state.dom.vChildren?._children;
      if (Array.isArray(files)) {
        for (const file of files) {
          for (const item of file.vChildren?._children ?? []) {
            if (!(isElement(item.el))) continue;
            item.el.querySelector(`:scope > .${ROWS_CLASS}`)?.remove();
            const body = item.el.querySelector<HTMLElement>(`:scope > .${BODY_CLASS}`);
            if (body) {
              while (body.firstChild) item.el.insertBefore(body.firstChild, body);
              body.remove();
            }
            item.el.classList.remove("bsrv-sr-match", "bsrv-sr-body-hidden", "bsrv-sr-gone");
            item.el.style.removeProperty("--bsrv-depth");
            if (this.hiddenByUs.has(item) && item.info) {
              item.info.hidden = false;
              this.hiddenByUs.delete(item);
            }
          }
        }
        for (const file of files) if (isElement(file.childrenEl)) file.childrenEl.classList.remove("bsrv-sr-wrap");
        state.dom.infinityScroll?.invalidateAll?.();
      }
      this.detach(leaf);
    }
  }
}
