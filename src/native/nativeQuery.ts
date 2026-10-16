/**
 * Obsidian 自带搜索面板的「搜索增强」（实验性，默认关闭）：
 * 在搜索框右边 ⚙ 打开的菜单里、原有的三个开关下面，加一组勾选框（异体字等同、跨页码与折行……），
 * 标明是本插件新增的；有选项在起作用时，⚙ 按钮上亮一个小圆点。
 * 并在自带搜索「开始搜索」时，把搜索框里的普通词按勾选翻译成正则再交给它的解析器。
 * 搜索框里显示的字、保存下来的搜索都不变，只有实际执行的那一刻不一样。
 *
 * 接入点：自带搜索的 startSearch 一开头就用 searchComponent.getValue() 读出查询串。
 * 我们在 startSearch 执行期间临时换掉 getValue，执行完立刻还原。
 * 但在搜索框里打字时，自带搜索走的是构造时就绑好的去抖函数，绕开了 startSearch 这个属性，
 * 所以还要接管搜索框的变化回调：打了字就按它原来的做法（清焦点、停旧搜索、下一拍重搜）自己调一次 startSearch。
 * 对不上（方法不在、找不到搜索框那一行、没有变化回调）就不接，不影响别的功能。
 */
import type { App, WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import { OPTION_LABELS } from "../shared/optionLabels";
import type { VariantTable } from "../shared/variants";
import type { SearchOptions } from "../variants/search";
import { rewriteQuery } from "./rewrite";

/** 选项区要用到的外部状态：当前勾选、异体对照表、是否已经自动展开过菜单、存盘 */
export interface NativeQueryHost {
  /** 界面上勾选框读写的那份选项（活的） */
  options(): SearchOptions;
  /** 实际用来改写查询的选项：异体字功能不显示时，「异体字等同」当作没勾 */
  effectiveOptions(): SearchOptions;
  variantsShown(): boolean;
  /** 已经建好的异体对照表；还没建好时为 null */
  table(): VariantTable | null;
  ensureTable(): Promise<unknown>;
  /** 第一次启用时自动把 ⚙ 菜单展开过一次了吗 */
  introduced(): boolean;
  markIntroduced(): void;
  save(): void;
}

interface SearchViewLike {
  containerEl: HTMLElement;
  /** ⚙ 菜单（原有的三个开关所在的容器）和打开它的按钮 */
  searchParamsContainerEl?: HTMLElement;
  filterSectionToggleEl?: HTMLElement;
  showParams?: boolean;
  toggleFilterSection?: () => void;
  searchComponent?: { getValue?: () => string; changeCallback?: (value: string) => void };
  dom?: { setFocusedItem?: (item: unknown) => void };
  startSearch?: () => void;
  stopSearch?: () => void;
}

interface Mounted {
  view: SearchViewLike;
  block: HTMLElement;
  hint: HTMLElement;
  unpatch: () => void;
}

/** 跨窗口也靠得住的元素判断（弹出窗口里的元素不是主窗口那个 HTMLElement 的实例） */
function isElement(value: unknown): value is HTMLElement {
  const candidate = value as { instanceOf?: (type: unknown) => boolean } | null | undefined;
  return !!candidate && typeof candidate.instanceOf === "function" && candidate.instanceOf(HTMLElement);
}

export class NativeSearchQuery {
  private enabled = false;
  private broken = false;
  private readonly mounted = new Map<WorkspaceLeaf, Mounted>();

  constructor(private readonly app: App, private readonly host: NativeQueryHost) {}

  setEnabled(enabled: boolean): void {
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    if (enabled) {
      this.broken = false;
      this.sync();
    } else this.teardown();
  }

  /** 找到所有自带搜索面板并装上选项区；面板关掉了就放手。布局变化时调用 */
  sync(): void {
    if (!this.enabled || this.broken) return;
    const leaves = this.app.workspace.getLeavesOfType("search");
    for (const leaf of leaves) {
      const view = leaf.view as unknown as SearchViewLike;
      const existing = this.mounted.get(leaf);
      if (existing && (existing.view !== view || !existing.block.isConnected)) this.unmount(leaf, false);
      if (!this.mounted.has(leaf)) this.mount(leaf, view);
    }
    for (const leaf of [...this.mounted.keys()]) if (!leaves.includes(leaf)) this.unmount(leaf, false);
  }

  /** 选项区要重装（比如「是否显示异体字功能」改了）：先撤再装 */
  refresh(): void {
    if (!this.enabled) return;
    this.teardown();
    this.sync();
  }

  /** 选项或对照表变了：让每个自带搜索面板按当前查询重搜一遍 */
  rerun(): void {
    for (const { view } of this.mounted.values()) view.startSearch?.();
  }

  private mount(leaf: WorkspaceLeaf, view: SearchViewLike): void {
    const anchor = view.searchParamsContainerEl;
    if (!isElement(anchor) || typeof view.startSearch !== "function" || typeof view.searchComponent?.getValue !== "function" || typeof view.searchComponent?.changeCallback !== "function") return;
    try {
      const block = this.buildBlock(view);
      anchor.append(block);
      const hint = block.querySelector<HTMLElement>(".bsrv-sr-options-hint");
      if (!hint) return;
      const mounted: Mounted = { view, block, hint, unpatch: () => undefined };
      mounted.unpatch = this.patchStartSearch(view, mounted);
      this.mounted.set(leaf, mounted);
      this.updateDot(view);
      // 菜单默认是收起的：第一次启用时替用户展开一次，让他看到新增的这组选项；之后听用户自己的
      if (!this.host.introduced()) {
        if (!view.showParams) view.toggleFilterSection?.();
        this.host.markIntroduced();
      }
    } catch (error) {
      console.error("[bsrv] Search options for Obsidian search failed and were turned off", error);
      this.broken = true;
      this.teardown();
    }
  }

  private unmount(leaf: WorkspaceLeaf, rerun: boolean): void {
    const mounted = this.mounted.get(leaf);
    if (!mounted) return;
    mounted.unpatch();
    mounted.block.remove();
    mounted.view.filterSectionToggleEl?.removeClass("bsrv-sr-dot");
    this.mounted.delete(leaf);
    if (rerun) mounted.view.startSearch?.();
  }

  private teardown(): void {
    for (const leaf of [...this.mounted.keys()]) this.unmount(leaf, true);
  }

  private buildBlock(view: SearchViewLike): HTMLElement {
    const block = createDiv({ cls: "bsrv-sr-options" });
    const head = block.createDiv({ cls: "bsrv-sr-options-head" });
    head.createSpan({ text: t("ns.title") });
    head.createSpan({ cls: "bsrv-sr-badge", text: t("ns.badge") });
    const body = block.createDiv({ cls: "bsrv-sr-options-body" });
    const options = this.host.options();
    for (const { key, label, title } of OPTION_LABELS) {
      if (key === "variants" && !this.host.variantsShown()) continue;
      const item = body.createEl("label", { cls: "bsrv-sr-option", attr: { title: t(title) } });
      const check = item.createEl("input", { type: "checkbox" });
      check.checked = options[key];
      item.appendText(t(label));
      check.addEventListener("change", () => {
        this.host.options()[key] = check.checked;
        this.host.save();
        this.updateDot(view);
        view.startSearch?.();
      });
    }
    block.createDiv({ cls: "bsrv-sr-options-hint", text: t("ns.skipped") });
    block.createDiv({ cls: "bsrv-sr-options-provider", text: t("ns.provider") });
    return block;
  }

  /** ⚙ 按钮上的小圆点：有选项在起作用时亮着，不用点开菜单也看得出搜索被改过 */
  private updateDot(view: SearchViewLike): void {
    const options = this.host.effectiveOptions();
    const on = options.variants || options.crossAnchors || options.crossMarkup || options.ignorePunct || options.titlesOnly;
    view.filterSectionToggleEl?.toggleClass("bsrv-sr-dot", on);
  }

  /** 把这个面板的 startSearch 包一层：执行期间 getValue 返回翻译后的查询，执行完还原。返回撤销函数 */
  private patchStartSearch(view: SearchViewLike, mounted: Mounted): () => void {
    const original = view.startSearch as () => void;
    let pending = false;
    const patched = (): void => {
      const component = view.searchComponent;
      const getValue = component?.getValue;
      if (!component || typeof getValue !== "function") return original.call(view);
      component.getValue = () => {
        const raw = getValue.call(component);
        try {
          const options = this.host.effectiveOptions();
          const table = this.host.table();
          if (!table && options.variants && !pending) {
            // 对照表还没建好：这一次先不带异体，建好后自动重搜一次
            pending = true;
            void this.host
              .ensureTable()
              .catch(() => undefined)
              .then(() => {
                pending = false;
                if (this.host.table()) view.startSearch?.();
              });
          }
          const result = rewriteQuery(raw, options, table);
          mounted.hint.toggleClass("is-shown", result.skipped);
          return result.query;
        } catch (error) {
          console.error("[bsrv] Failed to rewrite the search query", error);
          return raw;
        }
      };
      try {
        original.call(view);
      } finally {
        component.getValue = getValue;
      }
    };
    view.startSearch = patched;

    // 打字：照自带搜索原来的做法，但最后调的是我们包过的 startSearch
    const component = view.searchComponent;
    const originalCallback = component?.changeCallback;
    let timer: number | null = null;
    if (component && typeof originalCallback === "function") {
      component.changeCallback = (value: string) => {
        if (!value) return originalCallback.call(component, value);
        view.dom?.setFocusedItem?.(null);
        view.stopSearch?.();
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          view.startSearch?.();
        }, 0);
      };
    }
    return () => {
      // 只撤我们自己装的；别的插件后来又包了一层就留着（它调到的还是我们这层，但已经没有选项区在起作用）
      if (view.startSearch === patched) delete view.startSearch;
      if (timer !== null) window.clearTimeout(timer);
      if (component && originalCallback && component.changeCallback !== originalCallback) component.changeCallback = originalCallback;
    };
  }
}
