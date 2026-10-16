/**
 * 把一个文件里的命中，按各自的标题链归成一棵树（纯函数，不依赖 obsidian）。
 * 树的每个结点是一个标题，下面挂着命中和更深一层的标题；没有标题的命中挂在根上。
 */
import type { TrailItem } from "../variants/search";

export interface TreeNode<T> {
  /** 标题在原文里的起点，同一文件里唯一 */
  key: number;
  title: string;
  /** 直接挂在这个标题下的命中 */
  hits: T[];
  children: TreeNode<T>[];
  /** 这个标题下（含子标题）的命中总数 */
  count: number;
}

export interface TrailTree<T> {
  /** 不在任何标题下的命中 */
  rootHits: T[];
  children: TreeNode<T>[];
  count: number;
}

/** hits 须按在正文里出现的先后排好（检索结果本来就是这个顺序） */
export function buildTrailTree<T extends { trail: readonly TrailItem[] }>(hits: readonly T[]): TrailTree<T> {
  const rootHits: T[] = [];
  const children: TreeNode<T>[] = [];
  const stack: TreeNode<T>[] = [];
  for (const hit of hits) {
    if (!hit.trail.length) {
      rootHits.push(hit);
      continue;
    }
    // 与上一处命中共有的那段标题链沿用，其余的开新结点
    let shared = 0;
    while (shared < stack.length && shared < hit.trail.length && stack[shared].key === hit.trail[shared].from) shared++;
    stack.length = shared;
    for (let depth = shared; depth < hit.trail.length; depth++) {
      const item = hit.trail[depth];
      const node: TreeNode<T> = { key: item.from, title: item.title, hits: [], children: [], count: 0 };
      (depth === 0 ? children : stack[depth - 1].children).push(node);
      stack.push(node);
    }
    stack[stack.length - 1].hits.push(hit);
  }
  const total = rootHits.length + children.reduce((sum, node) => sum + countNode(node), 0);
  return { rootHits, children, count: total };
}

function countNode<T>(node: TreeNode<T>): number {
  node.count = node.hits.length + node.children.reduce((sum, child) => sum + countNode(child), 0);
  return node.count;
}

/**
 * 把同一结点下按先后排好的命中，按「同一段落、相隔不远」（joinGap 不为 null）并成组：每组画成一张卡片，
 * 组里每处命中都高亮。没有 joinGap 的命中自成一组。
 */
export function groupByBlock<T extends { hit: { joinGap: string | null } }>(items: readonly T[]): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    if (item.hit.joinGap !== null && groups.length) groups[groups.length - 1].push(item);
    else groups.push([item]);
  }
  return groups;
}
