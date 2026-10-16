/** 异体字检索的设置：对照表来源、自定义异体组、查找面板勾选框的默认值与记忆。 */
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from "./search";

export type SearchScope = "file" | "folder" | "vault";

export interface VariantSettings {
  /** 自定义异体组，一行一组，如「於于」 */
  customGroups: string;
  /** Unihan 繁简对应（鄴／邺、於／于、後／后） */
  unihanTradSimp: boolean;
  /** Unihan 同字异写 */
  unihanZ: boolean;
  /** Unihan 语义异体（范围宽） */
  unihanSemantic: boolean;
  /** 查找面板上次用的勾选框与范围，下次打开沿用 */
  options: SearchOptions;
  scope: SearchScope;
  /** 结果的显示：tree 按文件和标题链归成树，每处带所在段落；compact 一处一行 */
  resultView: ResultView;
  /** 增强 Obsidian 自带搜索：在搜索框下加选项区（按勾选改写查询），结果加标题分层（实验性，默认关） */
  nativeEnhance: boolean;
  /** 自带搜索里的选项区是否收起 */
  nativeOptionsCollapsed: boolean;
  /** 最多列出几处命中 */
  maxResults: number;
}

export type ResultView = "tree" | "compact";

export const DEFAULT_VARIANT_SETTINGS: VariantSettings = {
  customGroups: "",
  unihanTradSimp: true,
  unihanZ: true,
  unihanSemantic: false,
  options: { ...DEFAULT_SEARCH_OPTIONS },
  scope: "vault",
  resultView: "tree",
  nativeEnhance: false,
  nativeOptionsCollapsed: false,
  maxResults: 500
};

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function normalizeVariantSettings(raw: unknown): VariantSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const rawOptions = typeof source.options === "object" && source.options !== null ? (source.options as Record<string, unknown>) : {};
  const options = {} as SearchOptions;
  for (const key of Object.keys(DEFAULT_SEARCH_OPTIONS) as Array<keyof SearchOptions>) {
    options[key] = bool(rawOptions[key], DEFAULT_SEARCH_OPTIONS[key]);
  }
  const scope = source.scope === "file" || source.scope === "folder" || source.scope === "vault" ? source.scope : DEFAULT_VARIANT_SETTINGS.scope;
  const max = typeof source.maxResults === "number" && Number.isFinite(source.maxResults) ? Math.round(source.maxResults) : 500;
  return {
    customGroups: typeof source.customGroups === "string" ? source.customGroups : "",
    unihanTradSimp: bool(source.unihanTradSimp, DEFAULT_VARIANT_SETTINGS.unihanTradSimp),
    unihanZ: bool(source.unihanZ, DEFAULT_VARIANT_SETTINGS.unihanZ),
    unihanSemantic: bool(source.unihanSemantic, DEFAULT_VARIANT_SETTINGS.unihanSemantic),
    options,
    scope,
    resultView: source.resultView === "compact" || source.resultView === "tree" ? source.resultView : DEFAULT_VARIANT_SETTINGS.resultView,
    nativeEnhance: bool(source.nativeEnhance, DEFAULT_VARIANT_SETTINGS.nativeEnhance),
    nativeOptionsCollapsed: bool(source.nativeOptionsCollapsed, DEFAULT_VARIANT_SETTINGS.nativeOptionsCollapsed),
    maxResults: Math.min(5000, Math.max(20, max))
  };
}
