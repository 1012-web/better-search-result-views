/**
 * 编辑模式下把命中标在正文上：全部命中一种底色，当前那处另一种。
 * 只加样式，不改文档；正文改动时标记跟着平移，面板随后会按新正文重搜一遍。
 */
import { RangeSetBuilder, StateEffect, StateField, type Extension } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

export interface FindMarks {
  ranges: ReadonlyArray<{ from: number; to: number }>;
  /** ranges 里当前那处的下标；没有时为 -1 */
  current: number;
}

/** 换一批命中；null 表示清掉 */
export const setFindMarks = StateEffect.define<FindMarks | null>();

const hitMark = Decoration.mark({ class: "hist-search-find-hit" });
const currentMark = Decoration.mark({ class: "hist-search-find-hit hist-search-find-current" });

function build(marks: FindMarks | null, length: number): DecorationSet {
  if (!marks) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  let last = 0;
  marks.ranges.forEach((range, index) => {
    // 命中按出现先后、互不重叠；对不上当前文档的（文档刚改过）跳过
    if (range.from < last || range.to <= range.from || range.to > length) return;
    builder.add(range.from, range.to, index === marks.current ? currentMark : hitMark);
    last = range.to;
  });
  return builder.finish();
}

const findMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(setFindMarks)) return build(effect.value, tr.newDoc.length);
    return tr.docChanged ? value.map(tr.changes) : value;
  },
  provide: (field) => EditorView.decorations.from(field)
});

export function findMarksExtension(): Extension {
  return findMarksField;
}
