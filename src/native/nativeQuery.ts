/**
 * Obsidian 自带搜索面板的「搜索选项」（实验性，默认关闭）：
 * 在搜索框下面放一块一直显示的勾选框（异体字等同、跨页码与折行……），
 * 并在自带搜索「开始搜索」时，把搜索框里的普通词按勾选翻译成正则再交给它的解析器。
 * 搜索框里显示的字、保存下来的搜索都不变，只有实际执行的那一刻不一样。
 *
 * 接入点：自带搜索的 startSearch 一开头就用 searchComponent.getValue() 读出查询串。
 * 我们在 startSearch 执行期间临时换掉 getValue，执行完立刻还原。
 * 但在搜索框里打字时，自带搜索走的是构造时就绑好的去抖函数，绕开了 startSearch 这个属性，
 * 所以还要接管搜索框的变化回调：打了字就按它原来的做法（清焦点、停旧搜索、下一拍重搜）自己调一次 startSearch。
 * 对不上（方法不在、找不到搜索框那一行、没有变化回调）就不接，不影响别的功能。
 */
import { setIcon, type App, type WorkspaceLeaf } from "obsidian";
import { t } from "../i18n";
import { OPTION_LABELS } from "../shared/optionLabels";
import type { VariantTable } from "../shared/variants";
import type { SearchOptions } from "../variants/search";
import { rewriteQuery } from "./rewrite";

/** 选项区要用到的外部状态：当前勾选、异体对照表、折叠状态、存盘 */
export interface NativeQueryHost {
  options(): SearchOptions;
  /** 已经建好的异体对照表；还没建好时为 null */
  table(): VariantTable | null;
  ensureTable(): Promise<unknown>;
  collapsed(): boolean;
  setCollapsed(collapsed: boolean): void;
  save(): void;
}

interface SearchViewLike {
  containerEl: HTMLElement;
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

  /** 选项或对照表变了：让每个自带搜索面板按当前查询重搜一遍 */
  rerun(): void {
    for (const { view } of this.mounted.values()) view.startSearch?.();
  }

  private mount(leaf: WorkspaceLeaf, view: SearchViewLike): void {
    const anchor = view.containerEl?.querySelector<HTMLElement>(":scope > .search-row");
    if (!anchor || typeof view.startSearch !== "function" || typeof view.searchComponent?.getValue !== "function" || typeof view.searchComponent?.changeCallback !== "function") return;
    try {
      const block = this.buildBlock(view);
      anchor.after(block);
      const hint = block.querySelector<HTMLElement>(".bsrv-sr-options-hint");
      if (!hint) return;
      const mounted: Mounted = { view, block, hint, unpatch: () => undefined };
      mounted.unpatch = this.patchStartSearch(view, mounted);
      this.mounted.set(leaf, mounted);
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
    this.mounted.delete(leaf);
    if (rerun) mounted.view.startSearch?.();
  }

  private teardown(): void {
    for (const leaf of [...this.mounted.keys()]) this.unmount(leaf, true);
  }

  private buildBlock(view: SearchViewLike): HTMLElement {
    const block = createDiv({ cls: "bsrv-sr-options" });
    block.toggleClass("is-collapsed", this.host.collapsed());
    const head = block.createDiv({ cls: "bsrv-sr-options-head" });
    setIcon(head.createSpan({ cls: "bsrv-sr-options-chevron" }), "chevron-down");
    head.createSpan({ text: t("ns.title") });
    head.addEventListener("click", () => {
      const collapsed = !block.hasClass("is-collapsed");
      block.toggleClass("is-collapsed", collapsed);
      this.host.setCollapsed(collapsed);
    });
    const body = block.createDiv({ cls: "bsrv-sr-options-body" });
    const options = this.host.options();
    for (const { key, label, title } of OPTION_LABELS) {
      const item = body.createEl("label", { cls: "bsrv-sr-option", attr: { title: t(title) } });
      const check = item.createEl("input", { type: "checkbox" });
      check.checked = options[key];
      item.appendText(t(label));
      check.addEventListener("change", () => {
        this.host.options()[key] = check.checked;
        this.host.save();
        view.startSearch?.();
      });
    }
    body.createDiv({ cls: "bsrv-sr-options-hint", text: t("ns.skipped") });
    return block;
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
          const options = this.host.options();
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
