/**
 * 查找面板（侧栏）：搜索框、← → 在命中处之间跳、勾选框、范围、结果列表。
 * 结果有两种显示，可在面板上切换：树形（文件 → 标题链 → 命中所在的段落，命中字高亮），
 * 紧凑（一处一行，带页码标记、所属标题与上下文）。点一条跳到正文。
 * 树形的呈现思路参考了 Better Search Views（ivan-lednev，MIT）；代码是自己写的。
 */
import { ItemView, Notice, Platform, setIcon, type WorkspaceLeaf } from "obsidian";
import type VariantsModule from "../main";
import { buildTrailTree, groupByBlock, type TreeNode } from "../../shared/resultTree";
import type { SearchOptions, TrailItem } from "../search";
import type { SearchScope } from "../settings";
import type { FileHit } from "../main";

/** 树形里的一处命中：带上它在整个结果表里的下标，点击和上一处／下一处靠它定位 */
interface IndexedHit {
  trail: readonly TrailItem[];
  hit: FileHit;
  index: number;
}

/** 视图类型名：发布后不要再改，否则已保存的侧栏布局恢复不了 */
export const VARIANT_SEARCH_VIEW = "bsrv-variants";

const SEARCH_DELAY = 350;

const OPTION_LABELS: Array<{ key: keyof SearchOptions; label: string; title: string }> = [
  { key: "variants", label: "异体字等同", title: "按对照表把异体当同一个字（邺＝鄴）；对照表来源在设置里选" },
  { key: "crossAnchors", label: "跨页码与折行", title: "词被 <!--p.N--> 页码锚点或换行切开时照样能搜到" },
  { key: "crossMarkup", label: "跨标注与注释", title: "词中间夹着高亮标签、%%备注%%、脚注号时照样能搜到" },
  { key: "ignorePunct", label: "忽略标点", title: "标点不参与比对：「乙酉春」也能搜到「乙酉，春」" },
  { key: "titlesOnly", label: "只搜标题", title: "只在 # 标题行里找" }
];

const SCOPE_LABELS: Record<SearchScope, string> = { file: "当前文件", folder: "当前文件夹", vault: "全库" };

export class VariantSearchView extends ItemView {
  private inputEl!: HTMLInputElement;
  private statusEl!: HTMLElement;
  private listEl!: HTMLElement;
  private hits: FileHit[] = [];
  private current = -1;
  private timer: number | null = null;
  private runId = 0;

  constructor(leaf: WorkspaceLeaf, private readonly module: VariantsModule) {
    super(leaf);
  }

  getViewType(): string {
    return VARIANT_SEARCH_VIEW;
  }
  getDisplayText(): string {
    return "查找（异体字）";
  }
  getIcon(): string {
    return "search";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("bsrv-vs");

    const bar = root.createDiv({ cls: "bsrv-vs-bar" });
    const box = bar.createDiv({ cls: "bsrv-vs-box" });
    this.inputEl = box.createEl("input", { type: "search", cls: "bsrv-vs-input", attr: { placeholder: "输入要找的字词", spellcheck: "false" } });
    const clear = box.createEl("button", { cls: "bsrv-vs-icon clickable-icon", attr: { "aria-label": "清空" } });
    setIcon(clear, "x-circle");
    clear.addEventListener("click", () => {
      this.inputEl.value = "";
      this.show([], "");
      this.inputEl.focus();
    });
    const prev = bar.createEl("button", { cls: "bsrv-vs-icon clickable-icon", attr: { "aria-label": "上一处（Shift+Enter）" } });
    setIcon(prev, "arrow-left");
    prev.addEventListener("click", () => void this.step(-1));
    const next = bar.createEl("button", { cls: "bsrv-vs-icon clickable-icon", attr: { "aria-label": "下一处（Enter）" } });
    setIcon(next, "arrow-right");
    next.addEventListener("click", () => void this.step(1));

    this.inputEl.addEventListener("input", () => this.schedule());
    this.inputEl.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (this.timer !== null) {
        // 还没搜：先搜，再跳到第一处
        window.clearTimeout(this.timer);
        this.timer = null;
        void this.run().then(() => this.step(event.shiftKey ? -1 : 1));
      } else void this.step(event.shiftKey ? -1 : 1);
    });

    const options = root.createDiv({ cls: "bsrv-vs-options" });
    const settings = this.module.settings;
    for (const { key, label, title } of OPTION_LABELS) {
      const item = options.createEl("label", { cls: "bsrv-vs-option", attr: { title } });
      const check = item.createEl("input", { type: "checkbox" });
      check.checked = settings.options[key];
      item.appendText(label);
      check.addEventListener("change", () => {
        settings.options[key] = check.checked;
        void this.module.saveSettings();
        this.schedule(0);
      });
    }

    const tools = root.createDiv({ cls: "bsrv-vs-tools" });
    const scope = tools.createEl("select", { cls: "dropdown bsrv-vs-scope" });
    for (const [value, label] of Object.entries(SCOPE_LABELS)) scope.createEl("option", { value, text: label });
    scope.value = settings.scope;
    scope.addEventListener("change", () => {
      settings.scope = scope.value as SearchScope;
      void this.module.saveSettings();
      this.schedule(0);
    });
    const viewToggle = tools.createEl("button", { cls: "clickable-icon bsrv-vs-view-toggle" });
    const syncViewToggle = () => {
      const tree = settings.resultView === "tree";
      setIcon(viewToggle, tree ? "list-tree" : "list");
      viewToggle.setAttribute("aria-label", tree ? "现在是树形显示，点一下换成紧凑列表" : "现在是紧凑列表，点一下换成树形显示");
    };
    syncViewToggle();
    viewToggle.addEventListener("click", () => {
      settings.resultView = settings.resultView === "tree" ? "compact" : "tree";
      void this.module.saveSettings();
      syncViewToggle();
      const selected = this.current;
      this.show(this.hits, this.statusEl.getText());
      if (selected >= 0) this.markCurrent(selected);
    });
    const core = tools.createEl("button", { text: "在 Obsidian 搜索中打开", attr: { title: "把查询改写成带异体的正则，送进 Obsidian 自带搜索（自带搜索跨不过页码锚点与标注）" } });
    core.addEventListener("click", () => this.module.openCoreSearch(this.inputEl.value));

    this.statusEl = root.createDiv({ cls: "bsrv-vs-status" });
    this.listEl = root.createDiv({ cls: "bsrv-vs-list" });
    this.inputEl.focus();
  }

  async onClose(): Promise<void> {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.runId++;
  }

  /** 从命令调用：填入查询并立即搜索 */
  async searchFor(query: string): Promise<void> {
    this.inputEl.value = query;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    await this.run();
    this.inputEl.focus();
  }

  /** 对照表或设置变了：按当前查询重搜 */
  refresh(): void {
    if (this.inputEl?.value.trim()) this.schedule(0);
  }

  private schedule(delay = SEARCH_DELAY): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.run();
    }, delay);
  }

  private async run(): Promise<void> {
    const query = this.inputEl.value;
    const id = ++this.runId;
    if (!query.trim()) {
      this.show([], "");
      return;
    }
    this.statusEl.setText("查找中……");
    try {
      const result = await this.module.search(query, () => id !== this.runId);
      if (id !== this.runId) return;
      const capped = result.hits.length >= this.module.settings.maxResults ? `（只列前 ${this.module.settings.maxResults} 处，可在设置里调）` : "";
      const summary = result.hits.length
        ? `${result.scopeLabel}：${result.hits.length} 处，${result.fileCount} 个文件${capped}`
        : `${result.scopeLabel}：没有找到`;
      const note = result.notes.length ? `\n${result.notes.join("；")}` : "";
      this.show(result.hits, summary + note);
    } catch (error) {
      if (id !== this.runId) return;
      this.show([], `查找出错：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private show(hits: FileHit[], status: string): void {
    this.hits = hits;
    this.current = -1;
    this.statusEl.setText(status);
    this.listEl.empty();
    this.listEl.toggleClass("is-tree", this.module.settings.resultView === "tree");
    if (this.module.settings.resultView === "tree") this.showTree(hits);
    else this.showCompact(hits);
  }

  /** 紧凑：一处一行 */
  private showCompact(hits: FileHit[]): void {
    let lastPath = "";
    hits.forEach((hit, index) => {
      if (hit.path !== lastPath) {
        lastPath = hit.path;
        this.listEl.createDiv({ cls: "bsrv-vs-file", text: hit.path.replace(/\.md$/, "") });
      }
      const row = this.listEl.createDiv({ cls: "bsrv-vs-row", attr: { "data-index": String(index) } });
      const meta = row.createDiv({ cls: "bsrv-vs-meta" });
      if (hit.page !== null) meta.createSpan({ cls: "bsrv-vs-page", text: `p.${hit.page}` });
      if (hit.entry) meta.createSpan({ cls: "bsrv-vs-entry", text: hit.entry });
      if (hit.viaCandidate) meta.createSpan({ cls: "bsrv-vs-flag", text: "另读", attr: { title: "这处是按存疑字的另一种读法命中的" } });
      const text = row.createDiv({ cls: "bsrv-vs-text" });
      text.appendText(hit.before);
      text.createEl("mark", { text: hit.match });
      text.appendText(hit.after);
      this.addCopyButton(row.createDiv({ cls: "bsrv-vs-actions" }), hit);
      row.addEventListener("click", () => void this.select(index));
    });
  }

  /** 树形：文件 → 标题链 → 命中所在的段落 */
  private showTree(hits: FileHit[]): void {
    let start = 0;
    while (start < hits.length) {
      let end = start;
      while (end < hits.length && hits[end].path === hits[start].path) end++;
      const indexed: IndexedHit[] = [];
      for (let index = start; index < end; index++) indexed.push({ trail: hits[index].trail, hit: hits[index], index });
      const tree = buildTrailTree(indexed);
      const file = this.createCollapsible(this.listEl, hits[start].path.replace(/\.md$/, ""), tree.count, "bsrv-vs-file");
      this.renderHits(file, tree.rootHits);
      for (const node of tree.children) this.renderNode(file, node);
      start = end;
    }
  }

  /** 一个可折叠的结点：标题行（折叠箭头、标题、命中数）加下面的内容区；返回内容区 */
  private createCollapsible(parent: HTMLElement, title: string, count: number, headCls: string): HTMLElement {
    const wrap = parent.createDiv({ cls: "bsrv-vs-node" });
    const head = wrap.createDiv({ cls: `bsrv-vs-node-head ${headCls}` });
    setIcon(head.createSpan({ cls: "bsrv-vs-collapse" }), "chevron-down");
    head.createSpan({ cls: "bsrv-vs-node-title", text: title });
    head.createSpan({ cls: "bsrv-vs-node-count", text: String(count) });
    head.addEventListener("click", () => wrap.toggleClass("is-collapsed", !wrap.hasClass("is-collapsed")));
    return wrap.createDiv({ cls: "bsrv-vs-node-body" });
  }

  private renderNode(parent: HTMLElement, node: TreeNode<IndexedHit>): void {
    const body = this.createCollapsible(parent, node.title || "（无标题）", node.count, "bsrv-vs-heading");
    this.renderHits(body, node.hits);
    for (const child of node.children) this.renderNode(body, child);
  }

  /** 同一段里相隔不远的几处命中并成一张卡片 */
  private renderHits(parent: HTMLElement, items: readonly IndexedHit[]): void {
    for (const group of groupByBlock(items)) this.renderGroup(parent, group);
  }

  private renderGroup(parent: HTMLElement, group: IndexedHit[]): void {
    const first = group[0];
    const card = parent.createDiv({ cls: "bsrv-vs-card", attr: { "data-first": String(first.index) } });
    const flagged = group.some((item) => item.hit.viaCandidate);
    if (first.hit.page !== null || flagged) {
      const meta = card.createDiv({ cls: "bsrv-vs-meta" });
      if (first.hit.page !== null) meta.createSpan({ cls: "bsrv-vs-page", text: `p.${first.hit.page}` });
      if (flagged) meta.createSpan({ cls: "bsrv-vs-flag", text: "另读", attr: { title: "这张卡片里有按存疑字的另一种读法命中的" } });
    }
    const text = card.createDiv({ cls: "bsrv-vs-text" });
    text.appendText(first.hit.blockBefore);
    group.forEach(({ hit, index }, position) => {
      if (position > 0) text.appendText(hit.joinGap ?? "");
      text.createEl("mark", { text: hit.match, attr: { "data-hit": String(index) } });
    });
    text.appendText(group[group.length - 1].hit.blockAfter);
    this.addCopyButton(card.createDiv({ cls: "bsrv-vs-actions" }), first.hit);
    card.addEventListener("click", (event) => {
      const mark = (event.target as HTMLElement).closest<HTMLElement>("mark[data-hit]");
      void this.select(mark ? Number(mark.dataset.hit) : first.index);
    });
  }

  private addCopyButton(actions: HTMLElement, hit: FileHit): void {
    const copy = actions.createEl("button", { cls: "clickable-icon", attr: { "aria-label": "复制出处" } });
    setIcon(copy, "copy");
    copy.addEventListener("click", (event) => {
      event.stopPropagation();
      void this.module.copyCitation(hit);
    });
  }

  private async step(delta: number): Promise<void> {
    if (!this.hits.length) {
      if (this.inputEl.value.trim()) new Notice("没有找到");
      return;
    }
    const next = this.current < 0 ? (delta > 0 ? 0 : this.hits.length - 1) : (this.current + delta + this.hits.length) % this.hits.length;
    await this.select(next);
  }

  /** 把第 index 处标成当前：展开它外面折叠着的结点，滚到可见处 */
  private markCurrent(index: number): void {
    this.current = index;
    for (const item of Array.from(this.listEl.querySelectorAll(".is-current, .is-current-mark"))) item.removeClass("is-current", "is-current-mark");
    const mark = this.listEl.querySelector<HTMLElement>(`mark[data-hit="${index}"]`);
    const row = mark ? mark.closest<HTMLElement>(".bsrv-vs-card") : this.listEl.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!row) return;
    row.addClass("is-current");
    mark?.addClass("is-current-mark");
    for (let up = row.parentElement; up && up !== this.listEl; up = up.parentElement) up.removeClass("is-collapsed");
    row.scrollIntoView({ block: "nearest" });
  }

  private async select(index: number): Promise<void> {
    const hit = this.hits[index];
    if (!hit) return;
    this.markCurrent(index);
    await this.module.reveal(hit);
    // 手机上跳过去后面板会被盖住，不抢回焦点；电脑上把焦点留在搜索框，方便接着按 Enter
    if (!Platform.isMobile) this.inputEl.focus();
  }
}
