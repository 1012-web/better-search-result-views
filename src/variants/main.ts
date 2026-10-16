/**
 * 异体字检索：侧栏查找面板，按异体对照表把「邺」「鄴」当同一个字找，
 * 能跨页码锚点、折行、标注标签，结果带原书页码与所属条目。
 * 对照表只用于检索，绝不回写正文。只用 vault / workspace 接口，手机上也能用。
 */
import { MarkdownView, Notice, TFile } from "obsidian";
import { PluginModule } from "../core/module";
import { normalizeNewlines } from "../shared/markdown";
import { toSearchRegex } from "../shared/variants";
import { searchText, tokenize, tokenizeKey, type Candidate, type Hit, type Tokens } from "./search";
import { normalizeVariantSettings, type VariantSettings } from "./settings";
import { buildTable, filesInScope, type BuiltTable, type GroupSource } from "./sources";
import { VARIANT_SEARCH_VIEW, VariantSearchView } from "./ui/searchView";
import { renderVariantsSettings } from "./ui/settingsTab";
import { revealRange } from "./ui/navigate";
import { t } from "../i18n";
import { NativeSearchQuery } from "../native/nativeQuery";
import { NativeSearchTree } from "../native/nativeTree";

export interface FileHit extends Hit {
  path: string;
}

export interface SearchResult {
  hits: FileHit[];
  fileCount: number;
  scopeLabel: string;
  /** 附带说明，如某个对照表来源读取失败 */
  notes: string[];
}

/** 别的插件登记的「存疑字另读」来源：给一个文件，返回其中存疑字的另几种读法 */
export type CandidateSource = (file: TFile) => Promise<Candidate[] | null> | Candidate[] | null;

/** Obsidian 自带搜索（核心插件 global-search）的内部接口，没有公开类型 */
interface GlobalSearchLike {
  openGlobalSearch(query: string): void;
}
interface InternalPluginsLike {
  getPluginById(id: string): { enabled?: boolean; instance?: GlobalSearchLike } | null;
}

export default class VariantsModule extends PluginModule {
  settings!: VariantSettings;
  private built: BuiltTable | null = null;
  private building: Promise<BuiltTable> | null = null;
  private readonly groupSources: GroupSource[] = [];
  private candidateSource: CandidateSource | null = null;
  /** 切分结果缓存：文件路径 → 修改时间、大小、影响切分的选项与结果 */
  private tokenCache = new Map<string, { mtime: number; size: number; key: string; text: string; tokens: Tokens }>();
  /** 最近打开的正文：面板在侧栏里拿到焦点后，「当前文件」「当前文件夹」按它算 */
  private lastMarkdown: string | null = null;
  private nativeTree!: NativeSearchTree;
  private nativeQuery!: NativeSearchQuery;

  async onload(): Promise<void> {
    this.settings = normalizeVariantSettings(await this.loadData());
    this.registerView(VARIANT_SEARCH_VIEW, (leaf) => new VariantSearchView(leaf, this));
    this.registerCommands();
    this.nativeTree = new NativeSearchTree(this.app);
    this.nativeQuery = new NativeSearchQuery(this.app, {
      options: () => this.settings.options,
      table: () => this.built?.table ?? null,
      ensureTable: () => this.table(),
      collapsed: () => this.settings.nativeOptionsCollapsed,
      setCollapsed: (collapsed) => {
        this.settings.nativeOptionsCollapsed = collapsed;
        void this.saveSettings();
      },
      save: () => void this.saveSettings()
    });
    const syncNative = () => {
      this.nativeTree.sync();
      this.nativeQuery.sync();
    };
    this.registerEvent(this.app.workspace.on("layout-change", syncNative));
    this.registerEvent(this.app.workspace.on("active-leaf-change", syncNative));
    this.applyNativeEnhance();
    this.addRibbonIcon("search", t("cmd.search"), () => void this.openView());

    this.rememberActive();
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.rememberActive()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.rememberActive()));
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (file instanceof TFile && file.extension === "md") this.tokenCache.delete(file.path);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => this.tokenCache.delete(file.path)));
    this.registerEvent(this.app.vault.on("rename", (_file, oldPath) => this.tokenCache.delete(oldPath)));
  }

  onunload(): void {
    this.nativeQuery.setEnabled(false);
    this.nativeTree.setEnabled(false);
    this.tokenCache.clear();
  }

  renderSettings(containerEl: HTMLElement): void {
    renderVariantsSettings(containerEl, this);
  }

  /** 打开或关闭「增强 Obsidian 自带搜索」：搜索选项区 + 结果的标题分层 */
  async setNativeEnhance(enabled: boolean): Promise<void> {
    this.settings.nativeEnhance = enabled;
    this.applyNativeEnhance();
    await this.saveSettings();
  }

  private applyNativeEnhance(): void {
    this.nativeTree.setEnabled(this.settings.nativeEnhance);
    this.nativeQuery.setEnabled(this.settings.nativeEnhance);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async onExternalDataChange(data: unknown): Promise<void> {
    this.settings = normalizeVariantSettings(data);
    this.applyNativeEnhance();
    this.invalidateTable();
  }

  /** 对照表来源的设置改了 */
  invalidateTable(): void {
    this.built = null;
    this.building = null;
    this.nativeQuery?.rerun();
    for (const leaf of this.app.workspace.getLeavesOfType(VARIANT_SEARCH_VIEW)) {
      if (leaf.view instanceof VariantSearchView) leaf.view.refresh();
    }
  }

  /** 供别的插件登记额外的异体组来源。返回取消登记的函数 */
  registerGroupSource(source: GroupSource): () => void {
    this.groupSources.push(source);
    this.invalidateTable();
    return () => {
      const index = this.groupSources.indexOf(source);
      if (index >= 0) this.groupSources.splice(index, 1);
      this.invalidateTable();
    };
  }

  /** 供别的插件登记「存疑字另读」来源（如 OCR 校对插件）；同一时间只认一个，返回取消登记的函数 */
  registerCandidateSource(source: CandidateSource): () => void {
    this.candidateSource = source;
    return () => {
      if (this.candidateSource === source) this.candidateSource = null;
    };
  }

  async table(): Promise<BuiltTable> {
    if (this.built) return this.built;
    if (!this.building) {
      this.building = buildTable(this.settings, this.groupSources).then((built) => {
        this.built = built;
        return built;
      });
    }
    return this.building;
  }

  private rememberActive(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const path = view?.file?.path;
    if (path) this.lastMarkdown = path;
  }

  private registerCommands(): void {
    this.addCommand({
      id: "variant-search-open",
      name: t("cmd.search"),
      callback: () => void this.openView()
    });
    this.addCommand({
      id: "variant-search-selection",
      name: t("cmd.searchSelection"),
      editorCallback: (editor) => {
        const selection = editor.getSelection().trim();
        void this.openView(selection || undefined);
      }
    });
    this.addCommand({
      id: "variant-search-core",
      name: t("cmd.coreSearch"),
      editorCallback: (editor) => this.openCoreSearch(editor.getSelection())
    });
  }

  async openView(query?: string): Promise<void> {
    this.rememberActive();
    let leaf = this.app.workspace.getLeavesOfType(VARIANT_SEARCH_VIEW)[0] ?? null;
    if (!leaf) {
      const right = this.app.workspace.getRightLeaf(false);
      if (!right) return;
      await right.setViewState({ type: VARIANT_SEARCH_VIEW, active: true });
      leaf = right;
    }
    void this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof VariantSearchView && query) await view.searchFor(query);
  }

  /** 读正文并切分；同一文件、同一组切分选项、没改过就复用 */
  private async textAndTokens(file: TFile): Promise<{ text: string; tokens: Tokens }> {
    const key = tokenizeKey(this.settings.options);
    const cached = this.tokenCache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime && cached.size === file.stat.size && cached.key === key) return cached;
    const text = normalizeNewlines(await this.app.vault.cachedRead(file));
    const tokens = tokenize(text, this.settings.options);
    const entry = { mtime: file.stat.mtime, size: file.stat.size, key, text, tokens };
    this.tokenCache.set(file.path, entry);
    return entry;
  }

  async search(query: string, cancelled: () => boolean): Promise<SearchResult> {
    const { table, sources } = await this.table();
    const options = this.settings.options;
    const scope = filesInScope(this.app.vault, this.settings.scope, this.lastMarkdown);
    const notes = sources.filter((source) => source.error).map((source) => `${source.label}：${source.error}`);
    if (options.variants && table.empty) notes.push(t("note.tableEmpty"));
    const hits: FileHit[] = [];
    let fileCount = 0;
    const files = [...scope.files].sort((a, b) => a.path.localeCompare(b.path, "zh"));
    for (const file of files) {
      if (cancelled() || hits.length >= this.settings.maxResults) break;
      const { text, tokens } = await this.textAndTokens(file);
      const candidates = this.candidateSource ? await this.candidateSource(file) : null;
      const found = searchText({ text, query, options, table, candidates, tokens, limit: this.settings.maxResults - hits.length });
      if (!found.length) continue;
      fileCount++;
      for (const hit of found) hits.push({ ...hit, path: file.path });
    }
    return { hits, fileCount, scopeLabel: scope.label, notes };
  }

  async reveal(hit: FileHit): Promise<void> {
    const ok = await revealRange(this.app, hit.path, hit.from, hit.to, hit.line);
    if (!ok) new Notice(t("notice.cannotOpen", { path: hit.path }));
  }

  /** 复制出处：「《文件名》「条目」条p.764」，有页码标记或标题时才加上 */
  async copyCitation(hit: FileHit): Promise<void> {
    const parts = [t("cite.title", { title: hit.path.replace(/\.md$/, "").split("/").pop() ?? hit.path })];
    if (hit.entry) parts.push(t("cite.entry", { entry: hit.entry }));
    if (hit.page !== null) parts.push(t("cite.page", { page: hit.page }));
    const citation = parts.join("");
    await navigator.clipboard.writeText(citation);
    new Notice(t("notice.copied", { text: citation }));
  }

  /** 把查询改写成带异体的正则，送进 Obsidian 自带搜索 */
  openCoreSearch(query: string): void {
    void (async () => {
      const trimmed = query.trim();
      if (!trimmed) {
        new Notice(t("notice.needQuery"));
        return;
      }
      const { table } = await this.table();
      const regex = toSearchRegex(trimmed, this.settings.options.variants ? table : null);
      const internal = (this.app as unknown as { internalPlugins?: InternalPluginsLike }).internalPlugins;
      const search = internal?.getPluginById("global-search");
      if (!search?.enabled || !search.instance) {
        new Notice(t("notice.noCoreSearch"));
        return;
      }
      search.instance.openGlobalSearch(regex);
    })();
  }
}
