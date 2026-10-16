import { Setting } from "obsidian";
import { t } from "../../i18n";
import type VariantsModule from "../main";

/** 搜索面板的设置：画进传入的容器里（单独使用时是本插件的设置页，接入总览页时是其中一节）。 */
export function renderVariantsSettings(containerEl: HTMLElement, module: VariantsModule): void {
  containerEl.empty();
  const s = module.settings;
  let summary: HTMLElement | null = null;
  const changed = async () => {
    await module.saveSettings();
    module.invalidateTable();
    if (summary) renderSources(summary, module);
  };

  new Setting(containerEl).setName(t("vset.heading")).setHeading();
  new Setting(containerEl)
    .setName(t("vset.showName"))
    .setDesc(t("vset.showDesc"))
    .addToggle((toggle) => toggle.setValue(module.variantsShown()).onChange(async (value) => {
      await module.setShowVariants(value);
      renderVariantsSettings(containerEl, module);
    }));

  // 异体字相关的设置：不显示异体字功能时整块不画（英文界面默认如此）
  if (module.variantsShown()) {
    containerEl.createEl("p", { cls: "setting-item-description", text: t("vset.intro") });

    new Setting(containerEl).setName(t("vset.customName")).setDesc(t("vset.customDesc"));
    const custom = containerEl.createEl("textarea", { cls: "bsrv-vs-textarea", attr: { rows: "6", spellcheck: "false", "data-setting": "customGroups" } });
    custom.value = s.customGroups;
    custom.addEventListener("change", () => {
      s.customGroups = custom.value;
      void changed();
    });

    new Setting(containerEl).setName(t("vset.unihanHeading")).setHeading();
    new Setting(containerEl)
      .setName(t("vset.tsName"))
      .setDesc(t("vset.tsDesc"))
      .addToggle((toggle) => toggle.setValue(s.unihanTradSimp).onChange(async (value) => {
        s.unihanTradSimp = value;
        await changed();
      }));
    new Setting(containerEl)
      .setName(t("vset.zName"))
      .setDesc(t("vset.zDesc"))
      .addToggle((toggle) => toggle.setValue(s.unihanZ).onChange(async (value) => {
        s.unihanZ = value;
        await changed();
      }));
    new Setting(containerEl)
      .setName(t("vset.semName"))
      .setDesc(t("vset.semDesc"))
      .addToggle((toggle) => toggle.setValue(s.unihanSemantic).onChange(async (value) => {
        s.unihanSemantic = value;
        await changed();
      }));
  }

  new Setting(containerEl).setName(t("vset.resultHeading")).setHeading();
  new Setting(containerEl)
    .setName(t("vset.maxName"))
    .setDesc(t("vset.maxDesc"))
    .addText((text) => text.setValue(String(s.maxResults)).onChange(async (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      s.maxResults = Math.min(5000, Math.max(20, Math.round(n)));
      await module.saveSettings();
    }));

  new Setting(containerEl)
    .setName(t("vset.nativeName"))
    .setDesc(t("vset.nativeDesc"))
    .addToggle((toggle) => toggle.setValue(s.nativeEnhance).onChange((value) => module.setNativeEnhance(value)));

  if (module.variantsShown()) {
    summary = containerEl.createDiv({ cls: "bsrv-vs-sources" });
    renderSources(summary, module);
  }
}

function renderSources(el: HTMLElement, module: VariantsModule): void {
  el.empty();
  el.createDiv({ cls: "setting-item-name", text: t("vset.current") });
  const list = el.createEl("ul");
  list.createEl("li", { text: t("vset.counting") });
  void module.table().then(({ table, sources }) => {
    list.empty();
    if (!sources.length) list.createEl("li", { text: t("vset.noSources") });
    for (const source of sources) {
      list.createEl("li", {
        text: source.error ? t("vset.sourceError", { label: source.label, error: source.error }) : t("vset.sourceGroups", { label: source.label, n: source.groups })
      });
    }
    list.createEl("li", { text: t("vset.total", { n: table.size }) });
  });
}
