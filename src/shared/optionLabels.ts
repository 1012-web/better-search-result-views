import type { MessageKey } from "../i18n";
import type { SearchOptions } from "../variants/search";

/** 检索选项的勾选框：键、显示名、说明（自带搜索里的选项区用） */
export const OPTION_LABELS: Array<{ key: keyof SearchOptions; label: MessageKey; title: MessageKey }> = [
  { key: "variants", label: "vs.optVariants", title: "vs.optVariantsTip" },
  { key: "crossAnchors", label: "vs.optCross", title: "vs.optCrossTip" },
  { key: "crossMarkup", label: "vs.optMarkup", title: "vs.optMarkupTip" },
  { key: "ignorePunct", label: "vs.optPunct", title: "vs.optPunctTip" },
  { key: "titlesOnly", label: "vs.optTitles", title: "vs.optTitlesTip" }
];
