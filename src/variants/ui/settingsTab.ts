import { Setting } from "obsidian";
import type VariantsModule from "../main";

/** 异体字检索的设置：画进传入的容器里（单独使用时是本插件的设置页，接入总览页时是其中一节）。 */
export function renderVariantsSettings(containerEl: HTMLElement, module: VariantsModule): void {
  containerEl.empty();
  const s = module.settings;
  const changed = async () => {
    await module.saveSettings();
    module.invalidateTable();
    renderSources(summary, module);
  };

  new Setting(containerEl).setName("异体字检索").setHeading();
  containerEl.createEl("p", {
    cls: "setting-item-description",
    text: "查找面板里勾选「异体字等同」时，下面各来源的异体当同一个字找。对照表只用于检索，不改正文。"
  });

  new Setting(containerEl)
    .setName("自定义异体组")
    .setDesc("一行一组，同组的字互为异体，如「於于」「鄴邺」。字与字之间可以不加分隔。");
  const custom = containerEl.createEl("textarea", { cls: "hist-search-vs-textarea", attr: { rows: "6", spellcheck: "false", "data-setting": "customGroups" } });
  custom.value = s.customGroups;
  custom.addEventListener("change", () => {
    s.customGroups = custom.value;
    void changed();
  });

  new Setting(containerEl).setName("通用对照表（Unicode Unihan）").setHeading();
  new Setting(containerEl)
    .setName("繁简对应")
    .setDesc("约 6900 对，如 鄴／邺、疊／叠、於／于、後／后。打开后繁简互通，「后」也会搜到「後」。")
    .addToggle((toggle) => toggle.setValue(s.unihanTradSimp).onChange(async (value) => {
      s.unihanTradSimp = value;
      await changed();
    }));
  new Setting(containerEl)
    .setName("同字异写")
    .setDesc("约 90 对：字义全同、只是写法不同的字形。")
    .addToggle((toggle) => toggle.setValue(s.unihanZ).onChange(async (value) => {
      s.unihanZ = value;
      await changed();
    }));
  new Setting(containerEl)
    .setName("语义异体")
    .setDesc("约 2200 对：意义相通但不完全同字，范围宽，搜一个字会冒出不少不相干的结果。")
    .addToggle((toggle) => toggle.setValue(s.unihanSemantic).onChange(async (value) => {
      s.unihanSemantic = value;
      await changed();
    }));

  new Setting(containerEl).setName("结果").setHeading();
  new Setting(containerEl)
    .setName("最多列出几处")
    .setDesc("20 到 5000。全库搜常用字时结果会很多，列得太多面板会慢。")
    .addText((text) => text.setValue(String(s.maxResults)).onChange(async (value) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      s.maxResults = Math.min(5000, Math.max(20, Math.round(n)));
      await module.saveSettings();
    }));

  const summary = containerEl.createDiv({ cls: "hist-search-vs-sources" });
  renderSources(summary, module);
}

function renderSources(el: HTMLElement, module: VariantsModule): void {
  el.empty();
  el.createDiv({ cls: "setting-item-name", text: "当前对照表" });
  const list = el.createEl("ul");
  list.createEl("li", { text: "统计中……" });
  void module.table().then(({ table, sources }) => {
    list.empty();
    if (!sources.length) list.createEl("li", { text: "没有任何来源：勾选「异体字等同」也不会折叠。" });
    for (const source of sources) {
      list.createEl("li", { text: source.error ? `${source.label}：${source.error}` : `${source.label}：${source.groups} 组` });
    }
    list.createEl("li", { text: `合计登记 ${table.size} 个字` });
  });
}
