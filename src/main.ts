import { Plugin, PluginSettingTab, Setting, type App } from "obsidian";
import type { SectionHost, SectionKey } from "./core/module";
import FindModule from "./find/main";
import { setLanguage, t } from "./i18n";
import VariantsModule from "./variants/main";
import { WelcomeModal, shouldShowWelcome } from "./welcome";

/** data.json 的结构：每个部分各存一份设置。 */
interface PluginData {
  version: 1;
  sections: Partial<Record<SectionKey, unknown>>;
  /** 已经弹过功能介绍的版本号；没有就是还没弹过 */
  welcomed?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeData(raw: unknown): PluginData {
  const sections = isRecord(raw) && isRecord(raw.sections) ? raw.sections : {};
  const out: PluginData = { version: 1, sections: {} };
  for (const key of ["variants", "find"] as const) if (key in sections) out.sections[key] = sections[key];
  if (isRecord(raw) && typeof raw.welcomed === "string") out.welcomed = raw.welcomed;
  return out;
}

export default class HistSearchPlugin extends Plugin implements SectionHost {
  private data: PluginData = { version: 1, sections: {} };
  private saveChain: Promise<void> = Promise.resolve();
  /** 现在开着的功能介绍弹窗：再打开时先关掉它，免得叠好几层 */
  private welcome: WelcomeModal | null = null;
  variants!: VariantsModule;
  find!: FindModule;

  async onload(): Promise<void> {
    this.data = normalizeData(await this.loadData());
    this.variants = new VariantsModule(this, "variants");
    this.find = new FindModule(this, "find", this.variants);
    await this.variants.onload();
    await this.find.onload();
    this.addCommand({ id: "show-welcome", name: t("cmd.welcome"), callback: () => this.showWelcome() });
    this.addSettingTab(new HistSearchSettingTab(this.app, this));
    // 第一次启用：等工作区准备好以后弹一次功能介绍
    this.app.workspace.onLayoutReady(() => void this.maybeShowWelcome());
  }

  /** 弹功能介绍。先记下「已经弹过」再弹，免得弹窗出了问题每次启动都弹 */
  async maybeShowWelcome(): Promise<void> {
    if (!shouldShowWelcome(this.data.welcomed)) return;
    this.data.welcomed = this.manifest.version;
    await this.persist();
    this.showWelcome();
  }

  showWelcome(): void {
    this.welcome?.close();
    this.welcome = new WelcomeModal(this.app, {
      variants: this.variants.variantsShown(),
      nativeEnabled: this.variants.settings.nativeEnhance,
      onEnableNative: () => this.variants.setNativeEnhance(true)
    });
    this.welcome.open();
  }

  /** 测试和排查用：固定界面语言（传 null 恢复为跟随 Obsidian）。不是给用户的接口。 */
  debugSetLanguage(language: "en" | "zh" | null): void {
    setLanguage(language);
  }

  onunload(): void {
    this.welcome?.close();
    this.find.onunload();
    this.variants.onunload();
  }

  /**
   * 把本插件的全部设置画进容器。单独使用时由本插件的设置页调用；
   * 以后接入套件总览页时，总览页拿到本插件后调用同一个方法即可。
   */
  renderSettings(containerEl: HTMLElement): void {
    containerEl.empty();
    this.variants.renderSettings(containerEl.createDiv({ cls: "bsrv-settings-section" }));
    this.find.renderSettings(containerEl.createDiv({ cls: "bsrv-settings-section" }));
    new Setting(containerEl)
      .setName(t("welcome.settingName"))
      .addButton((button) => button.setButtonText(t("welcome.settingOpen")).onClick(() => this.showWelcome()));
  }

  async loadSection(key: SectionKey): Promise<unknown> {
    return this.data.sections[key] ?? null;
  }

  async saveSection(key: SectionKey, value: unknown): Promise<void> {
    this.data.sections[key] = value;
    await this.persist();
  }

  /**
   * data.json 被外部改了（同步盘、其他设备）时 Obsidian 调用。重新读入后只把真的变了的那几份通知给对应部分。
   * 读到的不是对象（文件正在同步、半截或损坏）就忽略这次，保留内存里的。
   */
  async onExternalSettingsChange(): Promise<void> {
    let changed: SectionKey[] = [];
    await this.enqueue(async () => {
      const raw: unknown = await this.loadData();
      if (!isRecord(raw)) return;
      const next = normalizeData(raw);
      changed = (["variants", "find"] as const).filter((key) => JSON.stringify(next.sections[key]) !== JSON.stringify(this.data.sections[key]));
      this.data = next;
    }).catch(() => undefined);
    for (const key of changed) {
      const module = key === "variants" ? this.variants : this.find;
      try {
        await module.onExternalDataChange?.(this.data.sections[key] ?? null);
      } catch (error) {
        console.error(`[bsrv] Failed to apply external settings (${key})`, error);
      }
    }
  }

  /** 读写 data.json 排成一条队列：两个部分可能同时保存，串行写盘，避免后写的覆盖先写的。 */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.saveChain.then(task);
    this.saveChain = run.then(() => undefined, (error: unknown) => {
      console.error("[bsrv] Failed to read or write settings", error);
    });
    return run;
  }

  private persist(): Promise<void> {
    return this.enqueue(() => this.saveData(this.data));
  }
}

class HistSearchSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: HistSearchPlugin) {
    super(app, plugin);
  }

  display(): void {
    this.plugin.renderSettings(this.containerEl);
  }
}
