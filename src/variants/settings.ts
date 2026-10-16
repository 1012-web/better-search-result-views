/** 搜索增强的设置：对照表来源、自定义异体组、搜索选项勾选框的默认值与记忆。 */
import type { Language } from "../i18n";
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from "./search";

export interface VariantSettings {
  /** 自定义异体组，一行一组，如「於于」 */
  customGroups: string;
  /** Unihan 繁简对应（鄴／邺、於／于、後／后） */
  unihanTradSimp: boolean;
  /** Unihan 同字异写 */
  unihanZ: boolean;
  /** Unihan 语义异体（范围宽） */
  unihanSemantic: boolean;
  /** 搜索选项上次用的勾选框，下次打开沿用 */
  options: SearchOptions;
  /** 是否显示异体字功能：null 表示跟随界面语言（中文界面显示，其余隐藏） */
  showVariants: boolean | null;
  /** 增强 Obsidian 自带搜索：在搜索框下加选项区（按勾选改写查询），结果加标题分层（默认开） */
  nativeEnhance: boolean;
  /** 第一次启用增强时，是否已经替用户把自带搜索的 ⚙ 菜单自动展开过一次 */
  nativeMenuIntroduced: boolean;
}

export const DEFAULT_VARIANT_SETTINGS: VariantSettings = {
  customGroups: "",
  unihanTradSimp: true,
  unihanZ: true,
  unihanSemantic: false,
  options: { ...DEFAULT_SEARCH_OPTIONS },
  showVariants: null,
  nativeEnhance: true,
  nativeMenuIntroduced: false
};

const bool = (value: unknown, fallback: boolean) => (typeof value === "boolean" ? value : fallback);

export function normalizeVariantSettings(raw: unknown): VariantSettings {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const rawOptions = typeof source.options === "object" && source.options !== null ? (source.options as Record<string, unknown>) : {};
  const options = {} as SearchOptions;
  for (const key of Object.keys(DEFAULT_SEARCH_OPTIONS) as Array<keyof SearchOptions>) {
    options[key] = bool(rawOptions[key], DEFAULT_SEARCH_OPTIONS[key]);
  }
  return {
    customGroups: typeof source.customGroups === "string" ? source.customGroups : "",
    unihanTradSimp: bool(source.unihanTradSimp, DEFAULT_VARIANT_SETTINGS.unihanTradSimp),
    unihanZ: bool(source.unihanZ, DEFAULT_VARIANT_SETTINGS.unihanZ),
    unihanSemantic: bool(source.unihanSemantic, DEFAULT_VARIANT_SETTINGS.unihanSemantic),
    options,
    showVariants: typeof source.showVariants === "boolean" ? source.showVariants : null,
    nativeEnhance: bool(source.nativeEnhance, DEFAULT_VARIANT_SETTINGS.nativeEnhance),
    nativeMenuIntroduced: bool(source.nativeMenuIntroduced, DEFAULT_VARIANT_SETTINGS.nativeMenuIntroduced)
  };
}

/** 异体字功能要不要显示：设置里明确选了就听设置的，没选（null）就看界面语言——中文显示，其余隐藏 */
export function variantsShownFor(setting: boolean | null, language: Language): boolean {
  return setting ?? language === "zh";
}
