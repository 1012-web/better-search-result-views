/**
 * 查找面板：浮在一篇正文的右上角，挂在这篇正文自己的窗口里（书开在弹出窗口时面板跟着书走）。
 * 搜索框、← →、两个开关、结果列表：一处命中一行，点一行跳过去。
 */
import { foldedRanges, unfoldEffect } from "@codemirror/language";
import type { StateEffect } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { Platform, setIcon, type MarkdownView } from "obsidian";
import { LineIndex } from "../../shared/markdown";
import { normalizeNewlines } from "../../shared/markdown";
import { buildTrailTree, groupByBlock, type TreeNode } from "../../shared/resultTree";
import type { VariantTable } from "../../shared/variants";
import { searchText, tokenize, tokenizeKey, type Hit, type SearchOptions, type Tokens } from "../../variants/search";
import { setFindMarks } from "../highlight";
import type FindModule from "../main";
import { PreviewMarker, previewScroller } from "../preview";
import { landingY, lineContext, nearestIndex, rowParts, startIndex, statusText, stepIndex, type Band } from "../rows";
import { MIN_PANEL_HEIGHT, MIN_PANEL_WIDTH, searchOptions } from "../settings";

/** 打字后隔多久搜 */
const INPUT_DELAY = 150;
/** 正文改动后隔多久重搜 */
const EDIT_DELAY = 400;
/** 落点指的是命中那行字的中间：行的上边缘要再高半行 */
const HALF_LINE = 12;
/** 阅读模式等段落渲染出来：每隔多久看一次、最多看几次、最多挪几次 */
const SETTLE_DELAY = 50;
const SETTLE_TRIES = 30;
const SETTLE_MOVES = 3;
/** 面板拖到底时至少露出标题栏这么高 */
const HEAD_HEIGHT = 32;
/** 树形里的一处命中：带上它在整个结果表里的下标 */
interface IndexedHit {
  trail: Hit["trail"];
  hit: Hit;
  index: number;
}

/** 结果列表一批建多少行；滚到离底不到 LIST_MARGIN 像素时再建下一批 */
const LIST_CHUNK = 200;
const LIST_MARGIN = 300;

export interface PanelPosition {
  /** 距正文区右边、上边的像素 */
  right: number;
  top: number;
}

function editorView(view: MarkdownView): EditorView | null {
  return (view.editor as unknown as { cm?: EditorView } | undefined)?.cm ?? null;
}

export class FindPanel {
  readonly root: HTMLElement;
  private readonly inputEl: HTMLInputElement;
  private readonly statusEl: HTMLElement;
  private readonly listEl: HTMLElement;
  private readonly listButton: HTMLButtonElement;
  private readonly viewButton: HTMLButtonElement;
  private readonly variantsButton: HTMLButtonElement;
  private readonly punctButton: HTMLButtonElement;
  private readonly marker: PreviewMarker;
  private hits: Hit[] = [];
  private current = -1;
  private capped = false;
  /** 上次查找时的正文、查询与规则：跳转前用来判断正文是否又改过，阅读模式标命中时沿用 */
  private text = "";
  private searched: { query: string; options: SearchOptions; table: VariantTable | null } | null = null;
  private tokenCache: { text: string; key: string; tokens: Tokens } | null = null;
  private path: string | null = null;
  private mode = "";
  private timer: number | null = null;
  private timerWin: Window | null = null;
  private pendingKeep = false;
  private runId = 0;
  private revealId = 0;
  private composing = false;
  private closed = false;
  /** 面板实际摆在哪（夹在正文区之内以后的） */
  private placed: PanelPosition = { right: 0, top: 0 };
  /** 结果列表里已经建出来的行数（分批建，见 renderRows） */
  private rendered = 0;

  constructor(readonly view: MarkdownView, private readonly module: FindModule) {
    this.marker = new PreviewMarker(view);
    this.root = view.contentEl.createDiv({ cls: "bsrv-find" });

    const head = this.root.createDiv({ cls: "bsrv-find-head" });
    head.createSpan({ cls: "bsrv-find-title", text: "查找" });
    this.statusEl = head.createSpan({ cls: "bsrv-find-status" });
    const close = head.createEl("button", { cls: "bsrv-find-icon clickable-icon", attr: { "aria-label": "关闭（Esc）" } });
    setIcon(close, "x");
    close.addEventListener("click", () => this.module.closePanel(this.view));
    this.enableDrag(head);

    const bar = this.root.createDiv({ cls: "bsrv-find-bar" });
    const box = bar.createDiv({ cls: "bsrv-find-box" });
    this.inputEl = box.createEl("input", { type: "text", cls: "bsrv-find-input", attr: { placeholder: "在本篇里找", spellcheck: "false" } });
    const clear = box.createEl("button", { cls: "bsrv-find-icon bsrv-find-clear clickable-icon", attr: { "aria-label": "清空" } });
    setIcon(clear, "x-circle");
    clear.addEventListener("click", () => {
      this.inputEl.value = "";
      void this.run();
      this.inputEl.focus();
    });
    const prev = bar.createEl("button", { cls: "bsrv-find-icon clickable-icon", attr: { "aria-label": "上一处（Shift+Enter）" } });
    setIcon(prev, "arrow-left");
    prev.addEventListener("click", () => void this.step(-1));
    const next = bar.createEl("button", { cls: "bsrv-find-icon clickable-icon", attr: { "aria-label": "下一处（Enter）" } });
    setIcon(next, "arrow-right");
    next.addEventListener("click", () => void this.step(1));

    const tools = this.root.createDiv({ cls: "bsrv-find-tools" });
    this.variantsButton = tools.createEl("button", { cls: "bsrv-find-toggle", text: "异体" });
    this.variantsButton.addEventListener("click", () => void this.module.updateSettings({ variants: !this.module.settings.variants }));
    this.punctButton = tools.createEl("button", {
      cls: "bsrv-find-toggle",
      text: "忽略标点",
      attr: { "aria-label": "标点不参与比对：「乙酉春」也能找到「乙酉，春」" }
    });
    this.punctButton.addEventListener("click", () => void this.module.updateSettings({ ignorePunct: !this.module.settings.ignorePunct }));
    tools.createDiv({ cls: "bsrv-find-spacer" });
    this.listButton = tools.createEl("button", { cls: "bsrv-find-icon clickable-icon", attr: { "aria-label": "显示查找结果列表" } });
    setIcon(this.listButton, "list");
    this.listButton.addEventListener("click", () => void this.module.updateSettings({ showList: !this.module.settings.showList }));
    this.viewButton = tools.createEl("button", { cls: "bsrv-find-icon clickable-icon" });
    setIcon(this.viewButton, "list-tree");
    this.viewButton.addEventListener("click", () => void this.module.updateSettings({ listView: this.module.settings.listView === "tree" ? "compact" : "tree" }));

    this.listEl = this.root.createDiv({ cls: "bsrv-find-list" });
    this.enableResize(this.root.createDiv({ cls: "bsrv-find-resize", attr: { "aria-label": "按住拖动：拉宽、拉高" } }));
    this.listEl.addEventListener("click", (event) => {
      const target = event.target as HTMLElement | null;
      const row = target?.closest<HTMLElement>(".bsrv-find-row, .bsrv-find-card");
      const index = Number(target?.closest<HTMLElement>("mark[data-hit]")?.dataset.hit ?? row?.dataset.index);
      if (row && Number.isInteger(index)) void this.select(index);
    });
    this.listEl.addEventListener("scroll", () => {
      const list = this.listEl;
      if (list.scrollTop + list.clientHeight > list.scrollHeight - LIST_MARGIN) this.renderRows(this.rendered + LIST_CHUNK);
    }, { passive: true });

    this.inputEl.addEventListener("compositionstart", () => {
      this.composing = true;
    });
    // 输入法拼字途中不搜（拼音字母不是要找的词）；上屏后再搜
    this.inputEl.addEventListener("compositionend", () => {
      this.composing = false;
      this.schedule(INPUT_DELAY);
    });
    this.inputEl.addEventListener("input", () => {
      if (!this.composing) this.schedule(INPUT_DELAY);
    });
    this.inputEl.addEventListener("keydown", (event) => {
      // 输入法里的 Enter 是「上屏」，不是「下一处」
      if (event.isComposing || this.composing || event.keyCode === 229) return;
      const delta = event.key === "Enter" ? (event.shiftKey ? -1 : 1) : event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      void this.step(delta);
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing || this.composing) return;
      event.preventDefault();
      event.stopPropagation();
      this.module.closePanel(this.view);
    });

    this.syncToggles();
    this.layout();
  }

  /** 把焦点放进搜索框；给了 prefill 就填上并立即查 */
  focus(prefill?: string): void {
    if (prefill !== undefined && prefill !== this.inputEl.value) {
      this.inputEl.value = prefill;
      void this.run();
    }
    this.inputEl.focus();
    this.inputEl.select();
  }

  /** 正文改了：稍等一下重搜，当前那处尽量不动 */
  refresh(): void {
    this.schedule(EDIT_DELAY, true);
  }

  /** 这个窗口换了文件，或切了编辑／阅读模式 */
  viewChanged(): void {
    const path = this.view.file?.path ?? null;
    if (path === this.path && this.view.getMode() === this.mode) return;
    void this.run(path === this.path);
  }

  /** 设置改了（面板上的开关、设置页、其他设备） */
  settingsChanged(): void {
    this.syncToggles();
    this.layout();
    void this.run(true);
  }

  /** 正文区大小变了，或位置、大小在别的面板上改了：重新摆好，别留在外面 */
  clamp(): void {
    this.layout();
  }

  destroy(): void {
    if (this.closed) return;
    this.closed = true;
    this.cancelTimer();
    this.runId++;
    this.revealId++;
    const hadFocus = this.root.contains(this.root.doc.activeElement);
    this.root.remove();
    this.marker.dispose();
    try {
      editorView(this.view)?.dispatch({ effects: setFindMarks.of(null) });
      if (hadFocus && this.view.getMode() === "source") this.view.editor.focus();
    } catch {
      // 视图已经关掉了：没有要清的
    }
  }

  private syncToggles(): void {
    const settings = this.module.settings;
    const toggle = (button: HTMLButtonElement, on: boolean) => {
      button.toggleClass("is-active", on);
      button.setAttribute("aria-pressed", String(on));
    };
    toggle(this.variantsButton, settings.variants);
    this.variantsButton.setAttribute("aria-label", "异体字等同：按对照表把异体当同一个字（邺＝鄴）");
    toggle(this.punctButton, settings.ignorePunct);
    toggle(this.listButton, settings.showList);
    toggle(this.viewButton, settings.listView === "tree");
    this.viewButton.setAttribute("aria-label", settings.listView === "tree" ? "现在是树形显示，点一下换成紧凑列表" : "现在是紧凑列表，点一下换成树形显示（按标题归类，带所在段落）");
    this.root.toggleClass("is-list-hidden", !settings.showList);
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.timerWin?.clearTimeout(this.timer);
    this.timer = null;
    this.timerWin = null;
  }

  private schedule(delay: number, keep = false): void {
    this.cancelTimer();
    const win = this.root.win;
    this.timerWin = win;
    this.pendingKeep = keep;
    this.timer = win.setTimeout(() => {
      this.timer = null;
      void this.run(keep);
    }, delay);
  }

  /** 按搜索框里的词在这篇正文里找一遍。keep：查的还是原来的词，当前那处接着算离它最近的一处 */
  private async run(keep = false): Promise<void> {
    if (this.closed) return;
    this.cancelTimer();
    const id = ++this.runId;
    const query = this.inputEl.value;
    this.module.lastQuery = query;
    const settings = this.module.settings;
    const options = searchOptions(settings);
    const previous = keep && this.current >= 0 ? this.hits[this.current]?.from ?? null : null;
    let table: VariantTable | null = null;
    if (query.trim() && settings.variants) {
      table = await this.module.variantTable();
      if (id !== this.runId || this.closed) return;
    }
    const text = normalizeNewlines(this.view.getViewData());
    let hits: Hit[] = [];
    if (query.trim()) {
      const key = tokenizeKey(options);
      if (!this.tokenCache || this.tokenCache.text !== text || this.tokenCache.key !== key) {
        this.tokenCache = { text, key, tokens: tokenize(text, options) };
      }
      hits = searchText({ text, query, options, table, tokens: this.tokenCache.tokens, limit: settings.maxResults });
    }
    this.path = this.view.file?.path ?? null;
    this.mode = this.view.getMode();
    this.text = text;
    this.hits = hits;
    this.capped = hits.length >= settings.maxResults;
    this.searched = query.trim() ? { query, options, table } : null;
    this.current = previous !== null ? nearestIndex(hits, previous) : -1;
    this.renderList();
    this.applyMarks();
  }

  private renderList(): void {
    const list = this.listEl;
    list.empty();
    this.rendered = 0;
    list.toggleClass("is-tree", this.module.settings.listView === "tree");
    if (this.module.settings.listView === "tree") this.renderTree();
    else this.renderRows(LIST_CHUNK);
    list.scrollTop = 0;
    this.paintCurrent();
  }

  /**
   * 把结果行建到第 until 行为止（已建的不重建）。一篇里的常用词可能有上千处：先建头一批，
   * 列表滚到底附近、或要显示的「当前那处」还没建出来时再接着建。直接用 DOM 接口：Obsidian 的 createEl 慢好几倍。
   */
  private renderRows(until: number): void {
    const to = Math.min(this.hits.length, until);
    if (to <= this.rendered) return;
    const doc = this.listEl.doc;
    const fragment = doc.createDocumentFragment();
    for (let index = this.rendered; index < to; index++) {
      const hit = this.hits[index];
      const parts = rowParts({ ...lineContext(this.text, hit.from, hit.to), match: hit.match });
      const row = doc.createElement("div");
      row.className = "bsrv-find-row";
      row.dataset.index = String(index);
      if (hit.entry) row.title = hit.entry;
      const line = doc.createElement("span");
      line.className = "bsrv-find-text";
      const mark = doc.createElement("mark");
      mark.textContent = parts.match;
      line.append(parts.before, mark, parts.after);
      row.append(line);
      if (hit.page !== null) {
        const page = doc.createElement("span");
        page.className = "bsrv-find-page";
        page.textContent = `p.${hit.page}`;
        row.append(page);
      }
      fragment.append(row);
    }
    this.listEl.append(fragment);
    this.rendered = to;
  }

  /** 树形：按标题链归成树，每处命中是一张带所在段落的卡片。一篇正文的命中不多，一次建完 */
  private renderTree(): void {
    const doc = this.listEl.doc;
    const indexed: IndexedHit[] = this.hits.map((hit, index) => ({ trail: hit.trail, hit, index }));
    const tree = buildTrailTree(indexed);
    const fragment = doc.createDocumentFragment();
    for (const group of groupByBlock(tree.rootHits)) fragment.append(this.treeCard(doc, group));
    for (const node of tree.children) fragment.append(this.treeNode(doc, node));
    this.listEl.append(fragment);
    this.rendered = this.hits.length;
  }

  private treeNode(doc: Document, node: TreeNode<IndexedHit>): HTMLElement {
    const wrap = doc.createElement("div");
    wrap.className = "bsrv-find-node";
    const head = doc.createElement("div");
    head.className = "bsrv-find-node-head";
    const title = doc.createElement("span");
    title.className = "bsrv-find-node-title";
    title.textContent = node.title || "（无标题）";
    const count = doc.createElement("span");
    count.className = "bsrv-find-node-count";
    count.textContent = String(node.count);
    head.append(title, count);
    head.addEventListener("click", () => wrap.classList.toggle("is-collapsed"));
    const body = doc.createElement("div");
    body.className = "bsrv-find-node-body";
    for (const group of groupByBlock(node.hits)) body.append(this.treeCard(doc, group));
    for (const child of node.children) body.append(this.treeNode(doc, child));
    wrap.append(head, body);
    return wrap;
  }

  /** 同一段里相隔不远的几处命中并成一张卡片，每处都高亮 */
  private treeCard(doc: Document, group: IndexedHit[]): HTMLElement {
    const first = group[0];
    const card = doc.createElement("div");
    card.className = "bsrv-find-card";
    card.dataset.index = String(first.index);
    const line = doc.createElement("span");
    line.className = "bsrv-find-text";
    line.append(first.hit.blockBefore);
    group.forEach(({ hit, index }, position) => {
      if (position > 0) line.append(hit.joinGap ?? "");
      const mark = doc.createElement("mark");
      mark.dataset.hit = String(index);
      mark.textContent = hit.match;
      line.append(mark);
    });
    line.append(group[group.length - 1].hit.blockAfter);
    card.append(line);
    if (first.hit.page !== null) {
      const page = doc.createElement("span");
      page.className = "bsrv-find-page";
      page.textContent = `p.${first.hit.page}`;
      card.append(page);
    }
    return card;
  }

  private paintCurrent(): void {
    const list = this.listEl;
    for (const item of Array.from(list.querySelectorAll(".is-current, .is-current-mark"))) item.removeClass("is-current", "is-current-mark");
    const tree = this.module.settings.listView === "tree";
    // 当前那处在还没建出来的行里：先建到它后面一点
    if (!tree && this.current >= this.rendered) this.renderRows(this.current + LIST_CHUNK / 2);
    const mark = tree && this.current >= 0 ? list.querySelector<HTMLElement>(`mark[data-hit="${this.current}"]`) : null;
    const row = this.current < 0 ? undefined : tree
      ? mark?.closest<HTMLElement>(".bsrv-find-card") ?? undefined
      : (list.children[this.current] as HTMLElement | undefined);
    if (row) {
      row.addClass("is-current");
      mark?.addClass("is-current-mark");
      // 只滚列表自己：scrollIntoView 会连带滚动外层的正文
      if (tree) {
        // 树里的卡片嵌在好几层里：展开外面折叠着的结点，按相对位置算
        for (let up = row.parentElement; up && up !== list; up = up.parentElement) up.removeClass("is-collapsed");
        const top = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
        if (top < list.scrollTop) list.scrollTop = top;
        else if (top + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + row.offsetHeight - list.clientHeight;
      } else if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
      else if (row.offsetTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = row.offsetTop + row.offsetHeight - list.clientHeight;
    }
    this.statusEl.setText(statusText(this.hits.length, this.current, this.capped, this.inputEl.value.trim().length > 0));
    this.root.toggleClass("is-empty", !this.hits.length);
  }

  /** 把命中标到正文上：编辑模式交给编辑器扩展，阅读模式交给 PreviewMarker */
  private applyMarks(): void {
    const source = this.view.getMode() === "source";
    try {
      editorView(this.view)?.dispatch({ effects: setFindMarks.of(source && this.hits.length ? { ranges: this.hits, current: this.current } : null) });
    } catch (error) {
      console.error("[bsrv] 编辑模式标出命中时出错", error);
    }
    // 实时预览里被换成 HTML 小部件的标注：装饰标不进去，由 marker 按渲染出来的文字补标
    this.marker.set(this.searched ? { ...this.searched, hits: this.hits, current: this.current } : null, source ? "widgets" : "preview");
  }

  private async step(delta: number): Promise<void> {
    // 刚打完字、还没搜：先搜
    if (this.timer !== null) await this.run(this.pendingKeep);
    const count = this.hits.length;
    if (!count || this.closed) return;
    let next: number;
    if (this.current >= 0) next = stepIndex(this.current, delta, count);
    else {
      // 还没有当前那处：从眼前的位置往后（或往前）找第一处
      const start = startIndex(this.hits, this.position());
      next = delta > 0 ? start : stepIndex(start, -1, count);
    }
    await this.select(next);
  }

  private async select(index: number): Promise<void> {
    if (this.closed || !this.hits[index]) return;
    this.current = index;
    // 正文在上次查找之后又改过（重搜还在等）：先按新正文重搜，再跳到离原来最近的那处
    if (normalizeNewlines(this.view.getViewData()) !== this.text) {
      await this.run(true);
      if (this.closed) return;
    }
    const hit = this.hits[this.current];
    if (!hit) return;
    this.paintCurrent();
    this.reveal(hit);
    // 焦点留在搜索框，方便接着按 Enter；手机上不抢，免得键盘弹出来挡住正文
    if (!Platform.isMobile) this.inputEl.focus({ preventScroll: true });
  }

  /** 眼前的位置：光标在屏幕里就按光标，不在就按屏幕顶端 */
  private position(): number {
    if (this.view.getMode() !== "source") {
      const line = Math.max(0, Math.floor(this.view.previewMode.getScroll()));
      return new LineIndex(this.text).lineStart(line);
    }
    const cm = editorView(this.view);
    if (!cm) return this.view.editor.posToOffset(this.view.editor.getCursor("from"));
    const box = cm.scrollDOM.getBoundingClientRect();
    const top = cm.lineBlockAtHeight(box.top - cm.documentTop).from;
    const bottom = cm.lineBlockAtHeight(box.bottom - cm.documentTop).to;
    const cursor = cm.state.selection.main.from;
    return cursor >= top && cursor <= bottom ? cursor : top;
  }

  private band(): Band | null {
    const rect = this.root.getBoundingClientRect();
    return rect.height ? { top: rect.top, bottom: rect.bottom } : null;
  }

  private reveal(hit: Hit): void {
    const id = ++this.revealId;
    if (this.view.getMode() === "source") this.revealInEditor(hit);
    else {
      this.view.previewMode.applyScroll(hit.line);
      this.applyMarks();
      this.settle(id, 0, 0);
    }
  }

  /** 编辑模式：选中命中的字，滚到不被面板挡住的地方；命中在折叠起来的标题底下时先展开 */
  private revealInEditor(hit: Hit): void {
    const cm = editorView(this.view);
    if (!cm) {
      const editor = this.view.editor;
      const from = editor.offsetToPos(hit.from);
      const to = editor.offsetToPos(hit.to);
      editor.setSelection(from, to);
      editor.scrollIntoView({ from, to }, true);
      return;
    }
    if (hit.to > cm.state.doc.length) return;
    const effects: StateEffect<unknown>[] = [];
    try {
      foldedRanges(cm.state).between(hit.from, hit.to, (from, to) => {
        effects.push(unfoldEffect.of({ from, to }));
      });
    } catch {
      // 取不到折叠信息：照常跳
    }
    const box = cm.scrollDOM.getBoundingClientRect();
    const margin = Math.max(0, landingY(box, this.band()) - box.top - HALF_LINE);
    effects.push(EditorView.scrollIntoView(hit.from, { y: "start", yMargin: margin }));
    effects.push(setFindMarks.of({ ranges: this.hits, current: this.current }));
    cm.dispatch({ selection: { anchor: hit.from, head: hit.to }, effects });
  }

  /**
   * 阅读模式：视图是边滚边渲染的，先滚到那一行，等命中所在的段落渲染出来再把它挪到落点；
   * 上面的段落换成真实高度后位置还会变，所以多对几次。
   */
  private settle(id: number, tries: number, moves: number): void {
    this.root.win.setTimeout(() => {
      if (this.closed || id !== this.revealId) return;
      this.marker.refresh();
      const rect = this.marker.currentRect();
      const scroller = previewScroller(this.view);
      if (!rect || !scroller) {
        if (tries < SETTLE_TRIES) this.settle(id, tries + 1, moves);
        return;
      }
      const delta = rect.top - (landingY(scroller.getBoundingClientRect(), this.band()) - HALF_LINE);
      if (Math.abs(delta) < 4 || moves >= SETTLE_MOVES) return;
      scroller.scrollTop += delta;
      this.settle(id, tries, moves + 1);
    }, SETTLE_DELAY);
  }

  /** 按设置里记的位置与大小摆好（夹在正文区之内；夹过的结果不写回设置，正文区变大后还能回到原位） */
  private layout(): void {
    const settings = this.module.settings;
    this.resize(settings.panelWidth, settings.panelHeight);
    this.place(this.module.position);
  }

  /** 宽度与「结果多时最高多高」交给样式表里的两个变量；height 为 0 表示用默认的最高高度 */
  private resize(width: number, height: number): void {
    this.root.style.setProperty("--bsrv-find-width", `${width}px`);
    if (height > 0) this.root.style.setProperty("--bsrv-find-height", `${height}px`);
    else this.root.style.removeProperty("--bsrv-find-height");
  }

  /** 摆到指定位置（夹在正文区之内），返回实际摆到的位置 */
  private place(position: PanelPosition): PanelPosition {
    const host = this.view.contentEl;
    // 这一页被别的标签页盖着时量不出大小：先不动
    if (!host.clientWidth || !host.clientHeight) return position;
    const right = Math.min(Math.max(0, host.clientWidth - this.root.offsetWidth), Math.max(0, position.right));
    const top = Math.min(Math.max(0, host.clientHeight - HEAD_HEIGHT), Math.max(0, position.top));
    this.root.style.right = `${right}px`;
    this.root.style.top = `${top}px`;
    // 面板的最大高度要扣掉它上面那一截，见 styles/find.css
    this.root.style.setProperty("--bsrv-find-top", `${top}px`);
    this.placed = { right, top };
    return this.placed;
  }

  /** 按住不放地拖：按下时记起点，移动时回调，松手（或被系统打断）时收尾 */
  private trackPointer<T>(handle: HTMLElement, begin: (event: PointerEvent) => T | null, move: (start: T, dx: number, dy: number) => void, finish: () => void): void {
    let start: { x: number; y: number; data: T } | null = null;
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      const data = begin(event);
      if (data === null) return;
      start = { x: event.clientX, y: event.clientY, data };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        // 捕获不了时只是鼠标移出把手后跟不上，照常能拖
      }
      // 不让这一下把焦点从搜索框带走，也不选中文字
      event.preventDefault();
    });
    handle.addEventListener("pointermove", (event) => {
      if (start) move(start.data, event.clientX - start.x, event.clientY - start.y);
    });
    const end = (event: PointerEvent) => {
      if (!start) return;
      start = null;
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch {
        // 已经放开了
      }
      finish();
    };
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  }

  /** 按住标题栏拖动；松手后记进设置，重启后还在那里 */
  private enableDrag(head: HTMLElement): void {
    this.trackPointer(
      head,
      (event) => ((event.target as HTMLElement | null)?.closest("button") ? null : { ...this.placed }),
      (origin, dx, dy) => {
        this.place({ right: origin.right - dx, top: origin.top + dy });
      },
      () => void this.module.saveLayout({ panelRight: Math.round(this.placed.right), panelTop: Math.round(this.placed.top) }, this)
    );
  }

  /**
   * 按住左下角的把手拉大小（面板靠右上角定位，所以把手在左下角：往左拉变宽，往下拉变高）。
   * 高度是「结果多时最高多高」：结果少时面板照旧收拢，不白白挡住正文；拉的时候临时撑到这么高，好看清拉到了哪。
   */
  private enableResize(handle: HTMLElement): void {
    let size = { width: 0, height: 0 };
    this.trackPointer(
      handle,
      () => {
        const rect = this.root.getBoundingClientRect();
        size = { width: rect.width, height: rect.height };
        this.resize(size.width, size.height);
        this.root.addClass("is-resizing");
        return { ...size };
      },
      (origin, dx, dy) => {
        const host = this.view.contentEl;
        const maxWidth = Math.max(MIN_PANEL_WIDTH, host.clientWidth - this.placed.right);
        const maxHeight = Math.max(MIN_PANEL_HEIGHT, host.clientHeight - this.placed.top - 8);
        size = {
          width: Math.min(maxWidth, Math.max(MIN_PANEL_WIDTH, origin.width - dx)),
          height: Math.min(maxHeight, Math.max(MIN_PANEL_HEIGHT, origin.height + dy))
        };
        this.resize(size.width, size.height);
      },
      () => {
        this.root.removeClass("is-resizing");
        size = { width: Math.round(size.width), height: Math.round(size.height) };
        this.resize(size.width, size.height);
        void this.module.saveLayout({ panelWidth: size.width, panelHeight: size.height }, this);
      }
    );
  }
}
