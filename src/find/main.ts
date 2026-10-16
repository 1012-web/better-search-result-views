/**
 * 文内查找：在正文上浮一个查找面板，输入即搜当前这篇，下面列出全部命中（一处一行），
 * 点哪条跳哪条。检索规则复用异体字检索的内核：页码锚点、标注标签不混进结果，被它们切开的词也找得到。
 * 可接管 Ctrl+F（Obsidian 自带的「搜索当前文件」）。只用 vault / workspace 接口，手机上也能用。
 */
import { MarkdownView, Platform } from "obsidian";
import { PluginModule } from "../core/module";
import type { VariantTable } from "../shared/variants";
import type { SectionHost, SectionKey } from "../core/module";
import type VariantsModule from "../variants/main";
import { findMarksExtension } from "./highlight";
import { normalizeFindSettings, type FindSettings } from "./settings";
import { FindPanel, type PanelPosition } from "./ui/panel";
import { renderFindSettings } from "./ui/settingsTab";

/** Obsidian 自带的「搜索当前文件」命令（内部接口，没有公开类型） */
const CORE_SEARCH_COMMAND = "editor:open-search";

interface CoreCommand {
  checkCallback?: (checking: boolean) => boolean | void;
}

/** 选中的文字拿来当查询：太长或跨行的多半不是要找的词 */
const MAX_PREFILL = 100;

export default class FindModule extends PluginModule {
  settings!: FindSettings;
  /** 本次会话里上一次查的词：新开的面板先填上它 */
  lastQuery = "";
  private readonly panels = new Map<MarkdownView, FindPanel>();
  private restoreCoreSearch: (() => void) | null = null;

  constructor(host: SectionHost, sectionKey: SectionKey, private readonly variants: VariantsModule) {
    super(host, sectionKey);
  }

  async onload(): Promise<void> {
    this.settings = normalizeFindSettings(await this.loadData());
    this.registerEditorExtension(findMarksExtension());
    this.registerCommands();
    this.patchCoreSearch();

    this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => {
      if (info instanceof MarkdownView) this.panels.get(info)?.refresh();
    }));
    // 阅读模式下正文被别处改了（另一个窗口、同步盘）也要重搜
    this.registerEvent(this.app.vault.on("modify", (file) => {
      for (const [view, panel] of this.panels) if (view.file === file) panel.refresh();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.syncPanels()));
    this.registerEvent(this.app.workspace.on("file-open", () => this.syncPanels()));
    this.registerEvent(this.app.workspace.on("resize", () => {
      for (const panel of this.panels.values()) panel.clamp();
    }));
  }

  onunload(): void {
    this.restoreCoreSearch?.();
    this.restoreCoreSearch = null;
    for (const panel of this.panels.values()) panel.destroy();
    this.panels.clear();
  }

  renderSettings(containerEl: HTMLElement): void {
    renderFindSettings(containerEl, this);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** 面板上的开关、设置页改了设置：存盘并让开着的面板都跟上 */
  async updateSettings(patch: Partial<FindSettings>): Promise<void> {
    Object.assign(this.settings, patch);
    for (const panel of this.panels.values()) panel.settingsChanged();
    await this.saveSettings();
  }

  async onExternalDataChange(data: unknown): Promise<void> {
    this.settings = normalizeFindSettings(data);
    for (const panel of this.panels.values()) panel.settingsChanged();
  }

  /** 面板的位置：没拖过时用默认的右上角。电脑上让开右边的滚动条；手机屏幕窄，贴边放 */
  get position(): PanelPosition {
    return { right: this.settings.panelRight ?? (Platform.isMobile ? 8 : 28), top: this.settings.panelTop };
  }

  /** 拖动、拉大小松手后：记进设置（重启后沿用），别的面板跟着摆；不用重搜 */
  async saveLayout(patch: Partial<Pick<FindSettings, "panelRight" | "panelTop" | "panelWidth" | "panelHeight">>, from?: FindPanel): Promise<void> {
    Object.assign(this.settings, patch);
    for (const panel of this.panels.values()) if (panel !== from) panel.clamp();
    await this.saveSettings();
  }

  /** 异体对照表（来源在「异体字检索」的设置里选）；读表出错时为 null */
  async variantTable(): Promise<VariantTable | null> {
    try {
      return (await this.variants.table()).table;
    } catch (error) {
      console.error("[bsrv] 文内查找读异体对照表出错", error);
      return null;
    }
  }

  private activeView(): MarkdownView | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.file ? view : null;
  }

  private registerCommands(): void {
    this.addCommand({
      id: "find-open",
      name: "文内查找（带结果列表）",
      checkCallback: (checking) => {
        const view = this.activeView();
        if (!view) return false;
        if (!checking) this.openPanel(view);
        return true;
      }
    });
    // 接管 Ctrl+F 之后，自带的查找条（含替换）从这条命令调出
    this.addCommand({
      id: "find-core",
      name: "Obsidian 自带的文内查找",
      checkCallback: (checking) => {
        const view = this.activeView();
        if (!view || typeof view.showSearch !== "function") return false;
        if (!checking) {
          this.closePanel(view);
          view.showSearch(false);
        }
        return true;
      }
    });
  }

  /**
   * 接管 Ctrl+F：给自带的「搜索当前文件」命令包一层。当前是一篇 Markdown 且设置开着时打开本面板，
   * 其余情况（画布、设置关着、不是正文）照旧走自带的。快捷键仍由用户在 Obsidian 里绑在那条命令上，这里不碰快捷键设置。
   * 卸载时还原；接口对不上（Obsidian 改了内部结构）就不接管，本模块自己的命令照常可用。
   */
  private patchCoreSearch(): void {
    const commands = (this.app as unknown as { commands?: { commands?: Record<string, CoreCommand | undefined> } }).commands?.commands;
    const command = commands?.[CORE_SEARCH_COMMAND];
    const original = command?.checkCallback;
    if (!command || typeof original !== "function") return;
    let active = true;
    const patched = (checking: boolean): boolean | void => {
      const view = active && this.settings.takeover ? this.activeView() : null;
      if (!view) return original.call(command, checking);
      if (!checking) this.openPanel(view);
      return true;
    };
    command.checkCallback = patched;
    this.restoreCoreSearch = () => {
      active = false;
      // 别的插件后来又包了一层时不能硬换回去：留着我们这层，它已不再接管
      if (command.checkCallback === patched) command.checkCallback = original;
    };
  }

  /** 在这篇正文上打开面板（已开着就把焦点放回搜索框）。有选中的文字就拿它当查询 */
  openPanel(view: MarkdownView): void {
    const selected = this.selectionIn(view);
    let panel = this.panels.get(view);
    if (panel && !panel.root.isConnected) {
      panel.destroy();
      panel = undefined;
    }
    if (!panel) {
      panel = new FindPanel(view, this);
      this.panels.set(view, panel);
      panel.focus(selected ?? this.lastQuery);
    } else panel.focus(selected ?? undefined);
  }

  closePanel(view: MarkdownView): void {
    this.panels.get(view)?.destroy();
    this.panels.delete(view);
  }

  /** 供测试与其他模块查询：这篇正文上开着的面板 */
  panelFor(view: MarkdownView): FindPanel | null {
    return this.panels.get(view) ?? null;
  }

  private selectionIn(view: MarkdownView): string | null {
    let text = "";
    if (view.getMode() === "source") text = view.editor.getSelection();
    else {
      const selection = view.containerEl.win.getSelection();
      if (selection && selection.anchorNode && view.previewMode.containerEl.contains(selection.anchorNode)) text = selection.toString();
    }
    text = text.trim();
    return text && text.length <= MAX_PREFILL && !text.includes("\n") ? text : null;
  }

  /** 布局变了：关掉的窗口连同面板一起收走；换了文件或切了模式的重搜 */
  private syncPanels(): void {
    for (const [view, panel] of this.panels) {
      if (!panel.root.isConnected) {
        panel.destroy();
        this.panels.delete(view);
      } else panel.viewChanged();
    }
  }
}
