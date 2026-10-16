import { Plugin, PluginSettingTab, type App } from "obsidian";
import type { SectionHost, SectionKey } from "./core/module";
import FindModule from "./find/main";
import VariantsModule from "./variants/main";

/** data.json 的结构：每个部分各存一份设置。 */
interface PluginData {
  version: 1;
  sections: Partial<Record<SectionKey, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeData(raw: unknown): PluginData {
  const sections = isRecord(raw) && isRecord(raw.sections) ? raw.sections : {};
  const out: PluginData = { version: 1, sections: {} };
  for (const key of ["variants", "find"] as const) if (key in sections) out.sections[key] = sections[key];
  return out;
}

export default class HistSearchPlugin extends Plugin implements SectionHost {
  private data: PluginData = { version: 1, sections: {} };
  private saveChain: Promise<void> = Promise.resolve();
  variants!: VariantsModule;
  find!: FindModule;

  async onload(): Promise<void> {
    this.data = normalizeData(await this.loadData());
    this.variants = new VariantsModule(this, "variants");
    this.find = new FindModule(this, "find", this.variants);
    await this.variants.onload();
    await this.find.onload();
    this.addSettingTab(new HistSearchSettingTab(this.app, this));
  }

  onunload(): void {
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
