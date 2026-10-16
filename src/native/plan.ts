/**
 * 给 Obsidian 自带搜索的结果加树形时用到的纯函数（不依赖 obsidian，便于测试）：
 * 每条结果前要补哪几行标题、折叠某个标题以后哪些东西该藏起来。
 */
import type { TrailItem } from "../variants/search";

/** 一条结果（自带搜索里一处命中的上下文）算出来的显示计划 */
export interface MatchPlan {
  /** 这条结果所属的整条标题链（最外层在前） */
  trail: TrailItem[];
  /** 要在这条结果前补出的标题行：只补和上一条不共用的那几层 */
  rows: Array<{ item: TrailItem; depth: number }>;
}

/** items 须按在正文里出现的先后排好。每条结果只补「和上一条不共用」的标题层，共用的上层只在第一次出现时画一次 */
export function planMatches(trails: readonly (readonly TrailItem[])[]): MatchPlan[] {
  const plans: MatchPlan[] = [];
  let previous: readonly TrailItem[] = [];
  for (const trail of trails) {
    let shared = 0;
    while (shared < previous.length && shared < trail.length && previous[shared].from === trail[shared].from) shared++;
    plans.push({
      trail: [...trail],
      rows: trail.slice(shared).map((item, offset) => ({ item, depth: shared + offset }))
    });
    previous = trail;
  }
  return plans;
}

export interface Visibility {
  /** 每个标题行是否显示，顺序同 plan.rows */
  rows: boolean[];
  /** 结果正文（命中的上下文）是否显示 */
  body: boolean;
  /** 整条结果是否还有东西可显示；没有就整条从布局里拿掉 */
  any: boolean;
}

/**
 * 折叠状态下一条结果该显示什么：
 * 标题行——它的上级里有折叠的就藏（自己折叠了，行还在，方便点开）；
 * 正文——标题链上任何一层折叠了就藏。
 */
export function visibilityOf(plan: MatchPlan, collapsed: ReadonlySet<number>): Visibility {
  const anyCollapsedAbove = (depth: number) => plan.trail.slice(0, depth).some((item) => collapsed.has(item.from));
  const rows = plan.rows.map((row) => !anyCollapsedAbove(row.depth));
  const body = !plan.trail.some((item) => collapsed.has(item.from));
  return { rows, body, any: body || rows.some(Boolean) };
}
