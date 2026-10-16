/**
 * 搜索增强：异体对照表、搜索选项的记忆，以及对 Obsidian 自带搜索的增强（选项区、查询改写、标题树）。
 * 对照表只用于检索，绝不回写正文。只用 vault / workspace 接口，手机上也能用。
 */
import { PluginModule } from "../core/module";
import type { SearchOptions } from "./search";
import { normalizeVariantSettings, variantsShownFor, type VariantSettings } from "./settings";
import { buildTable, type BuiltTable, type GroupSource } from "./sources";
import { renderVariantsSettings } from "./ui/settingsTab";
import { currentLanguage } from "../i18n";
import { NativeSearchQuery } from "../native/nativeQuery";
import { NativeSearchTree } from "../native/nativeTree";

export default class VariantsModule extends PluginModule {
  settings!: VariantSettings;
  private built: BuiltTable | null = null;
  private building: Promise<BuiltTable> | null = null;
  private readonly groupSources: GroupSource[] = [];
  private nativeTree!: NativeSearchTree;
  private nativeQuery!: NativeSearchQuery;

  async onload(): Promise<void> {
    this.settings = normalizeVariantSettings(await this.loadData());
    this.nativeTree = new NativeSearchTree(this.app);
    this.nativeQuery = new NativeSearchQuery(this.app, {
      options: () => this.settings.options,
      effectiveOptions: () => this.effectiveOptions(),
      variantsShown: () => this.variantsShown(),
      table: () => this.built?.table ?? null,
      ensureTable: () => this.table(),
      introduced: () => this.settings.nativeMenuIntroduced,
      markIntroduced: () => {
        this.settings.nativeMenuIntroduced = true;
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
    // 0.1.0 里有过自带的侧栏面板（已移除）：关掉工作区里残留的那一格，免得留下一个空白页签
    this.app.workspace.onLayoutReady(() => this.app.workspace.detachLeavesOfType("bsrv-variants"));
  }

  onunload(): void {
    this.nativeQuery.setEnabled(false);
    this.nativeTree.setEnabled(false);
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

  /** 异体字功能是否显示：设置里明确选了就听设置的，没选就看界面语言（中文显示，其余隐藏） */
  variantsShown(): boolean {
    return variantsShownFor(this.settings.showVariants, currentLanguage());
  }

  /** 实际用来检索的选项：异体字功能不显示时，「异体字等同」一律当作没勾 */
  effectiveOptions(): SearchOptions {
    const options = this.settings.options;
    return this.variantsShown() || !options.variants ? options : { ...options, variants: false };
  }

  /** 设置里改了「是否显示异体字功能」：对照表要重建，自带搜索里的选项区要重装 */
  async setShowVariants(show: boolean): Promise<void> {
    this.settings.showVariants = show;
    await this.saveSettings();
    this.invalidateTable();
    this.nativeQuery.refresh();
  }

  async table(): Promise<BuiltTable> {
    if (this.built) return this.built;
    if (!this.building) {
      // 异体字功能不显示时不建对照表（Unihan 那三张表也就不读了）
      const source = this.variantsShown()
        ? this.settings
        : { ...this.settings, customGroups: "", unihanTradSimp: false, unihanZ: false, unihanSemantic: false };
      this.building = buildTable(source, this.groupSources).then((built) => {
        this.built = built;
        return built;
      });
    }
    return this.building;
  }
}
