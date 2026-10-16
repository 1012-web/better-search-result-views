/** 文内查找模块的设置：是否接管 Ctrl+F、面板上各开关的记忆、最多列出几处。 */
import type { SearchOptions } from "../variants/search";

export interface FindSettings {
  /** 接管 Ctrl+F：Obsidian 自带的「搜索当前文件」改为打开本面板 */
  takeover: boolean;
  /** 面板里展开结果列表（面板右侧的列表按钮，下次沿用） */
  showList: boolean;
  /** 结果列表的显示：compact 一处一行；tree 按标题链归成树，每处带所在段落 */
  listView: ListView;
  /** 已提示过「右边两个按钮可切换视图、收起列表」：第一次打开面板时提示一次 */
  viewTipShown: boolean;
  /** 异体字等同（对照表来源在「异体字检索」的设置里选） */
  variants: boolean;
  /** 忽略标点 */
  ignorePunct: boolean;
  /** 跨页码与折行：词被 <!--p.N--> 或换行切开也能找到 */
  crossAnchors: boolean;
  /** 跨标注与注释：词中间夹着标注标签、%%备注%%、脚注号也能找到 */
  crossMarkup: boolean;
  /** 最多列出几处 */
  maxResults: number;
  /** 面板的位置（像素）：距正文区右边、上边。panelRight 为 null 表示没拖过，用默认的右上角 */
  panelRight: number | null;
  panelTop: number;
  /** 面板的宽度，与结果多时最高多高（像素）；panelHeight 为 0 表示默认：正文区的六成、不超过 560 */
  panelWidth: number;
  panelHeight: number;
}

export type ListView = "compact" | "tree";

export const DEFAULT_FIND_SETTINGS: FindSettings = {
  takeover: true,
  showList: true,
  listView: "tree",
  viewTipShown: false,
  variants: true,
  ignorePunct: false,
  crossAnchors: true,
  crossMarkup: true,
  maxResults: 1000,
  panelRight: null,
  panelTop: 8,
  panelWidth: 420,
  panelHeight: 0
};

export const MIN_RESULTS = 50;
export const MAX_RESULTS = 5000;
/** 面板拉大小时的下限 */
export const MIN_PANEL_WIDTH = 280;
export const MIN_PANEL_HEIGHT = 140;
/** 记下来的像素值的上限：防着设置文件被改坏 */
const MAX_PIXELS = 4000;

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

/** 像素值：不是数就用 fallback，是数就取整并夹在 [min, MAX_PIXELS] */
function pixels(value: unknown, fallback: number, min: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_PIXELS, Math.max(min, Math.round(value)));
}

export function clampResults(value: number): number {
  return Math.min(MAX_RESULTS, Math.max(MIN_RESULTS, Math.round(value)));
}

export function normalizeFindSettings(raw: unknown): FindSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_FIND_SETTINGS;
  const max = typeof source.maxResults === "number" && Number.isFinite(source.maxResults) ? source.maxResults : d.maxResults;
  return {
    takeover: bool(source.takeover, d.takeover),
    showList: bool(source.showList, d.showList),
    listView: source.listView === "tree" || source.listView === "compact" ? source.listView : d.listView,
    viewTipShown: bool(source.viewTipShown, d.viewTipShown),
    variants: bool(source.variants, d.variants),
    ignorePunct: bool(source.ignorePunct, d.ignorePunct),
    crossAnchors: bool(source.crossAnchors, d.crossAnchors),
    crossMarkup: bool(source.crossMarkup, d.crossMarkup),
    maxResults: clampResults(max),
    panelRight: typeof source.panelRight === "number" && Number.isFinite(source.panelRight) ? pixels(source.panelRight, 0, 0) : null,
    panelTop: pixels(source.panelTop, d.panelTop, 0),
    panelWidth: pixels(source.panelWidth, d.panelWidth, MIN_PANEL_WIDTH),
    panelHeight: source.panelHeight === 0 ? 0 : pixels(source.panelHeight, d.panelHeight, MIN_PANEL_HEIGHT)
  };
}

/** 交给检索内核的选项：文内查找不用「只搜标题」一项 */
export function searchOptions(settings: FindSettings, variantsOn: boolean = settings.variants): SearchOptions {
  return {
    variants: variantsOn,
    crossAnchors: settings.crossAnchors,
    crossMarkup: settings.crossMarkup,
    ignorePunct: settings.ignorePunct,
    titlesOnly: false
  };
}
