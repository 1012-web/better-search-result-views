/**
 * 首次启用时弹出的功能介绍：这个插件给搜索加了什么。只在第一次弹，之后可以从命令面板和设置页再打开。
 */
import { Modal, Notice, type App } from "obsidian";
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

export class WelcomeModal extends Modal {
  constructor(app: App, private readonly options: WelcomeOptions) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("bsrv-welcome");
    this.setTitle(t("welcome.title"));
    contentEl.createEl("p", { cls: "bsrv-welcome-intro", text: t("welcome.intro") });

    // 第一部分：文内查找。图是上下排开的（上面自带、下面本插件）
    this.addSection("welcome.sectionFind", "welcome.sectionFindText", [{ id: "find", title: "welcome.cmpFindTitle", text: "welcome.cmpFindText" }]);
    // 第二部分：自带侧栏搜索。图是左右排开的（左边自带、右边开启搜索增强之后）
    this.addSection("welcome.sectionSide", "welcome.sectionSideText", [
      { id: "tree", title: "welcome.cmpTreeTitle", text: "welcome.cmpTreeText" },
      { id: "cross", title: "welcome.cmpCrossTitle", text: "welcome.cmpCrossText" },
      { id: "variants", title: "welcome.cmpVariantsTitle", text: "welcome.cmpVariantsText" }
    ]);

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

  private addSection(title: MessageKey, text: MessageKey, figures: Array<{ id: GuideId; title: MessageKey; text: MessageKey }>): void {
    const section = this.contentEl.createDiv({ cls: "bsrv-welcome-compare" });
    section.createDiv({ cls: "bsrv-welcome-compare-title", text: t(title) });
    section.createEl("p", { cls: "bsrv-welcome-text", text: t(text) });
    const images = GUIDE_IMAGES[currentLanguage()];
    for (const figureInfo of figures) {
      const src = images[figureInfo.id];
      if (!src || (figureInfo.id === "variants" && !this.options.variants)) continue;
      const figure = section.createDiv({ cls: "bsrv-welcome-figure" });
      figure.createDiv({ cls: "bsrv-welcome-title", text: t(figureInfo.title) });
      figure.createDiv({ cls: "bsrv-welcome-text", text: t(figureInfo.text) });
      figure.createEl("img", { cls: "bsrv-welcome-shot", attr: { src, alt: t(figureInfo.title) } });
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
