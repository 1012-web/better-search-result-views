import { Setting } from "obsidian";
import { t } from "../../i18n";
import type FindModule from "../main";
import { DEFAULT_FIND_SETTINGS, MAX_RESULTS, MIN_RESULTS, clampResults } from "../settings";

/** 文内查找的设置：画进传入的容器里（单独使用时是本插件的设置页，接入总览页时是其中一节）。 */
export function renderFindSettings(containerEl: HTMLElement, module: FindModule): void {
  containerEl.empty();
  const s = module.settings;

  new Setting(containerEl).setName(t("fset.heading")).setHeading();
  containerEl.createEl("p", { cls: "setting-item-description", text: t("fset.intro") });

  new Setting(containerEl)
    .setName(t("fset.takeoverName"))
    .setDesc(t("fset.takeoverDesc"))
    .addToggle((toggle) => toggle.setValue(s.takeover).onChange((value) => module.updateSettings({ takeover: value })));

  new Setting(containerEl)
    .setName(t("fset.crossName"))
    .setDesc(t("fset.crossDesc"))
    .addToggle((toggle) => toggle.setValue(s.crossAnchors).onChange((value) => module.updateSettings({ crossAnchors: value })));

  new Setting(containerEl)
    .setName(t("fset.markupName"))
    .setDesc(t("fset.markupDesc"))
    .addToggle((toggle) => toggle.setValue(s.crossMarkup).onChange((value) => module.updateSettings({ crossMarkup: value })));

  new Setting(containerEl)
    .setName(t("fset.maxName"))
    .setDesc(t("fset.maxDesc", { min: MIN_RESULTS, max: MAX_RESULTS }))
    .addText((text) => text.setValue(String(s.maxResults)).onChange((value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      void module.updateSettings({ maxResults: clampResults(n) });
    }));

  const d = DEFAULT_FIND_SETTINGS;
  new Setting(containerEl)
    .setName(t("fset.layoutName"))
    .setDesc(t("fset.layoutDesc"))
    .addButton((button) => button.setButtonText(t("fset.reset")).onClick(() =>
      module.saveLayout({ panelRight: d.panelRight, panelTop: d.panelTop, panelWidth: d.panelWidth, panelHeight: d.panelHeight })));
}
