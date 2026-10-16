import { Setting } from "obsidian";
import type FindModule from "../main";
import { DEFAULT_FIND_SETTINGS, MAX_RESULTS, MIN_RESULTS, clampResults } from "../settings";

/** 文内查找的设置：画进传入的容器里（单独使用时是本插件的设置页，接入总览页时是其中一节）。 */
export function renderFindSettings(containerEl: HTMLElement, module: FindModule): void {
  containerEl.empty();
  const s = module.settings;

  new Setting(containerEl).setName("文内查找").setHeading();
  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "在正文上浮一个查找面板：输入即搜当前这篇，下面列出全部命中，点哪条跳哪条。「异体」「忽略标点」和结果列表的开关在面板上，会记住上次的选择。"
  });

  new Setting(containerEl)
    .setName("接管 Ctrl+F")
    .setDesc("在正文里按 Ctrl+F（Obsidian 自带的「搜索当前文件」）时打开本面板。关掉后 Ctrl+F 回到自带的查找条，本面板从命令「文内查找（带结果列表）」打开。自带的查找条（含替换）随时可以从命令「Obsidian 自带的文内查找」调出。")
    .addToggle((toggle) => toggle.setValue(s.takeover).onChange((value) => module.updateSettings({ takeover: value })));

  new Setting(containerEl)
    .setName("跨页码与折行")
    .setDesc("词被 <!--p.N--> 页码锚点或换行切开时照样能找到。")
    .addToggle((toggle) => toggle.setValue(s.crossAnchors).onChange((value) => module.updateSettings({ crossAnchors: value })));

  new Setting(containerEl)
    .setName("跨标注与注释")
    .setDesc("词中间夹着高亮标签、%%备注%%、脚注号时照样能找到。")
    .addToggle((toggle) => toggle.setValue(s.crossMarkup).onChange((value) => module.updateSettings({ crossMarkup: value })));

  new Setting(containerEl)
    .setName("最多列出几处")
    .setDesc(`${MIN_RESULTS} 到 ${MAX_RESULTS}。一篇里的常用字可能有上千处，列得太多面板会慢。`)
    .addText((text) => text.setValue(String(s.maxResults)).onChange((value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      void module.updateSettings({ maxResults: clampResults(n) });
    }));

  const d = DEFAULT_FIND_SETTINGS;
  new Setting(containerEl)
    .setName("面板的位置与大小")
    .setDesc("按住面板的标题栏可以拖动，按住左下角可以拉宽、拉高；拖到哪、拉多大都会记住，重启后还在。这里可以恢复成默认的右上角与默认大小。")
    .addButton((button) => button.setButtonText("恢复默认").onClick(() =>
      module.saveLayout({ panelRight: d.panelRight, panelTop: d.panelTop, panelWidth: d.panelWidth, panelHeight: d.panelHeight })));
}
