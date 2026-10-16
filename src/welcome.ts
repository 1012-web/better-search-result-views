/**
 * 首次启用时弹出的功能介绍：这个插件给搜索加了什么。只在第一次弹，之后可以从命令面板和设置页再打开。
 */
import { Modal, Notice, setIcon, type App } from "obsidian";
import { currentLanguage, t, type MessageKey } from "./i18n";
import { GUIDE_IMAGES, type GuideId } from "./guide/images";

/** 还没弹过（data.json 里没有记下弹过的版本号）才弹 */
export function shouldShowWelcome(welcomed: unknown): boolean {
  return typeof welcomed !== "string";
}

export interface WelcomeOptions {
  /** 异体字功能是否显示：不显示时介绍里也不提 */
  variants: boolean;
  /** 「增强 Obsidian 自带搜索」是否已经打开：打开了就不再给「现在打开」的按钮 */
  nativeEnabled: boolean;
  onEnableNative(): Promise<void> | void;
}

interface Item {
  icon: string;
  title: MessageKey;
  text: MessageKey;
}

export class WelcomeModal extends Modal {
  constructor(app: App, private readonly options: WelcomeOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("bsrv-welcome");
    this.setTitle(t("welcome.title"));
    // 介绍和对比图在可滚动的区域里；提示和按钮放在它下面，滚到哪里都看得见、不被裁
    const scroll = contentEl.createDiv({ cls: "bsrv-welcome-scroll" });
    scroll.createEl("p", { cls: "bsrv-welcome-intro", text: t("welcome.intro") });

    const items: Item[] = [
      { icon: "search", title: "welcome.findTitle", text: "welcome.findText" },
      { icon: "list-tree", title: "welcome.nativeTitle", text: "welcome.nativeText" },
      { icon: "scissors", title: "welcome.crossTitle", text: "welcome.crossText" }
    ];
    if (this.options.variants) items.push({ icon: "languages", title: "welcome.variantsTitle", text: "welcome.variantsText" });

    const list = scroll.createDiv({ cls: "bsrv-welcome-list" });
    for (const item of items) {
      const row = list.createDiv({ cls: "bsrv-welcome-item" });
      setIcon(row.createDiv({ cls: "bsrv-welcome-icon" }), item.icon);
      const body = row.createDiv({ cls: "bsrv-welcome-body" });
      body.createDiv({ cls: "bsrv-welcome-title", text: t(item.title) });
      body.createDiv({ cls: "bsrv-welcome-text", text: t(item.text) });
    }

    // 效果对比：真实截图，左边自带搜索，右边打开搜索增强之后
    const compare = scroll.createDiv({ cls: "bsrv-welcome-compare" });
    compare.createDiv({ cls: "bsrv-welcome-compare-title", text: t("welcome.compareTitle") });
    compare.createEl("p", { cls: "bsrv-welcome-text", text: t("welcome.compareNote") });
    const images = GUIDE_IMAGES[currentLanguage()];
    const pairs: Array<{ id: GuideId; title: MessageKey; text: MessageKey }> = [
      { id: "find", title: "welcome.cmpFindTitle", text: "welcome.cmpFindText" },
      { id: "tree", title: "welcome.cmpTreeTitle", text: "welcome.cmpTreeText" },
      { id: "cross", title: "welcome.cmpCrossTitle", text: "welcome.cmpCrossText" },
      { id: "variants", title: "welcome.cmpVariantsTitle", text: "welcome.cmpVariantsText" }
    ];
    for (const pair of pairs) {
      const src = images[pair.id];
      if (!src || (pair.id === "variants" && !this.options.variants)) continue;
      const figure = compare.createDiv({ cls: "bsrv-welcome-figure" });
      figure.createDiv({ cls: "bsrv-welcome-title", text: t(pair.title) });
      figure.createDiv({ cls: "bsrv-welcome-text", text: t(pair.text) });
      figure.createEl("img", { cls: "bsrv-welcome-shot", attr: { src, alt: t(pair.title) } });
    }

    contentEl.createEl("p", { cls: "bsrv-welcome-later", text: t("welcome.later") });
    const footer = contentEl.createDiv({ cls: "bsrv-welcome-footer" });
    if (!this.options.nativeEnabled) {
      const enable = footer.createEl("button", { text: t("welcome.enable") });
      enable.addEventListener("click", () => {
        void Promise.resolve(this.options.onEnableNative()).then(() => new Notice(t("welcome.enabled")));
        this.close();
      });
    }
    const close = footer.createEl("button", { cls: "mod-cta", text: t("welcome.close") });
    close.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
