/**
 * 检索用到的外部数据：异体对照表的各来源。
 */
import { UNIHAN_SEMANTIC, UNIHAN_TRAD_SIMP, UNIHAN_Z } from "../shared/unihan-variants";
import { VariantTable, parseGroupLines } from "../shared/variants";
import type { VariantSettings } from "./settings";
import { t } from "../i18n";

/** 折叠表各来源的登记情况，面板与设置页上显示 */
export interface TableSource {
  label: string;
  groups: number;
  error?: string;
}

export interface BuiltTable {
  table: VariantTable;
  sources: TableSource[];
}

/** 别的插件登记的异体组来源：返回若干组，同组的字互为异体 */
export interface GroupSource {
  label: string;
  load(): Promise<string[][]> | string[][];
}

export async function buildTable(settings: VariantSettings, extra: readonly GroupSource[]): Promise<BuiltTable> {
  const table = new VariantTable();
  const sources: TableSource[] = [];
  const custom = parseGroupLines(settings.customGroups);
  if (custom.length) {
    for (const group of custom) table.addGroup(group);
    sources.push({ label: t("src.custom"), groups: custom.length });
  }
  const unihan: Array<[boolean, string, string]> = [
    [settings.unihanTradSimp, t("src.tradSimp"), UNIHAN_TRAD_SIMP],
    [settings.unihanZ, t("src.z"), UNIHAN_Z],
    [settings.unihanSemantic, t("src.semantic"), UNIHAN_SEMANTIC]
  ];
  for (const [on, label, packed] of unihan) {
    if (!on) continue;
    table.addPairs(packed);
    sources.push({ label, groups: [...packed].length / 2 });
  }
  for (const source of extra) {
    try {
      const groups = await source.load();
      for (const group of groups) table.addGroup(group);
      sources.push({ label: source.label, groups: groups.length });
    } catch (error) {
      sources.push({ label: source.label, groups: 0, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { table, sources };
}
