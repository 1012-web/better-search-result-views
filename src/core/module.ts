import type { App, Plugin } from "obsidian";

/** data.json 里每个部分的键：异体字检索、文内查找各存一份设置。 */
export type SectionKey = "variants" | "find";

/** 部分（section）能向插件要的东西：自己那一份设置的读写。 */
export interface SectionHost extends Plugin {
  loadSection(key: SectionKey): Promise<unknown>;
  saveSection(key: SectionKey, data: unknown): Promise<void>;
}

/**
 * 插件里的两个部分（异体字检索、文内查找）的基类。
 * 子类照常调用 addCommand、registerView 等；这些都转交给插件，卸载时由插件统一清理。
 * 设置界面写成 renderSettings(containerEl)：只管往传进来的容器里画，
 * 单独使用时由本插件的设置页调用，将来接入套件总览页时由总览页调用。
 */
export abstract class PluginModule {
  readonly app: App;

  readonly addCommand: Plugin["addCommand"];
  readonly addRibbonIcon: Plugin["addRibbonIcon"];
  readonly registerView: Plugin["registerView"];
  readonly registerEditorExtension: Plugin["registerEditorExtension"];
  readonly registerEvent: Plugin["registerEvent"];

  constructor(protected readonly host: SectionHost, readonly sectionKey: SectionKey) {
    this.app = host.app;
    this.addCommand = host.addCommand.bind(host);
    this.addRibbonIcon = host.addRibbonIcon.bind(host);
    this.registerView = host.registerView.bind(host);
    this.registerEditorExtension = host.registerEditorExtension.bind(host);
    this.registerEvent = host.registerEvent.bind(host);
  }

  abstract onload(): Promise<void> | void;

  onunload(): void {}

  /** 把本部分的设置画进容器。可重复调用（先清空再画）。 */
  abstract renderSettings(containerEl: HTMLElement): void;

  /**
   * data.json 被外部改了（同步盘或其他设备写入）、而且本部分那一份数据真的变了时，插件调用它；
   * data 是新数据（没有时为 null）。应据此替换内存里的设置并刷新界面，不需要也不应再保存回去。
   */
  onExternalDataChange?(data: unknown): void | Promise<void>;

  loadData(): Promise<unknown> {
    return this.host.loadSection(this.sectionKey);
  }

  saveData(data: unknown): Promise<void> {
    return this.host.saveSection(this.sectionKey, data);
  }
}
