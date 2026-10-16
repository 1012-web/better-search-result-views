/**
 * 检索用到的外部数据：异体对照表的各来源、要搜的文件。只用 vault 接口，手机上也能用。
 */
import { TFile, type Vault } from "obsidian";
import { UNIHAN_SEMANTIC, UNIHAN_TRAD_SIMP, UNIHAN_Z } from "../shared/unihan-variants";
import { VariantTable, parseGroupLines } from "../shared/variants";
import type { SearchScope, VariantSettings } from "./settings";

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
    sources.push({ label: "自定义异体组", groups: custom.length });
  }
  const unihan: Array<[boolean, string, string]> = [
    [settings.unihanTradSimp, "Unihan 繁简对应", UNIHAN_TRAD_SIMP],
    [settings.unihanZ, "Unihan 同字异写", UNIHAN_Z],
    [settings.unihanSemantic, "Unihan 语义异体", UNIHAN_SEMANTIC]
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

export interface ScopeResult {
  files: TFile[];
  /** 面板上显示的范围说明，如「文件夹 史料/晚明」 */
  label: string;
}

/** 按范围列出要搜的 Markdown 文件。activePath 是最近打开的正文；没有时「当前文件」「当前文件夹」都退为全库 */
export function filesInScope(vault: Vault, scope: SearchScope, activePath: string | null): ScopeResult {
  const all = vault.getMarkdownFiles();
  if (scope === "file" && activePath) {
    const file = vault.getAbstractFileByPath(activePath);
    if (file instanceof TFile) return { files: [file], label: file.basename };
  }
  if (scope === "folder" && activePath) {
    const root = activePath.includes("/") ? activePath.slice(0, activePath.lastIndexOf("/")) : "";
    const prefix = root ? `${root}/` : "";
    return { files: all.filter((file) => file.path.startsWith(prefix)), label: root ? `文件夹 ${root}` : "库根目录" };
  }
  return { files: all, label: "全库" };
}
