import { describe, expect, it } from "vitest";
import { DEFAULT_SEARCH_OPTIONS, searchText } from "../../src/variants/search";
import { buildTrailTree, groupByBlock } from "../../src/shared/resultTree";

const doc = [
  "# 鄴城记事",
  "",
  "## 卷一",
  "",
  "<!--p.12-->",
  "令夷吾握筹，鄴侯司券，邺下诸生皆以为得人。",
  "",
  "### 条一",
  "",
  "后来鄴城陷落，邺侯北走。",
  "",
  "## 卷二",
  "",
  "鄴下風流，至今未絕。",
  "",
  "## 卷二",
  "",
  "鄴侯再起。"
].join("\n");

const find = (text: string, query: string) => searchText({ text, query, options: { ...DEFAULT_SEARCH_OPTIONS, variants: false }, table: null });

describe("标题链与段落上下文", () => {
  it("命中带完整标题链，最近的一环就是 entry", () => {
    const hits = find(doc, "鄴城陷落");
    expect(hits).toHaveLength(1);
    expect(hits[0].trail.map((item) => item.title)).toEqual(["鄴城记事", "卷一", "条一"]);
    expect(hits[0].entry).toBe("条一");
  });

  it("兄弟标题不进链，退回上一级", () => {
    const [hit] = find(doc, "鄴下風流");
    expect(hit.trail.map((item) => item.title)).toEqual(["鄴城记事", "卷二"]);
  });

  it("没有标题时链为空", () => {
    const [hit] = find("開篇即言鄴城", "鄴城");
    expect(hit.trail).toEqual([]);
    expect(hit.entry).toBeNull();
  });

  it("段落上下文取到空行为止，不带页码标记", () => {
    const [hit] = find(doc, "鄴侯司券");
    expect(hit.blockBefore).toBe("令夷吾握筹，");
    expect(hit.blockAfter).toBe("，邺下诸生皆以为得人。");
  });

  it("过长的段落两端截断并标出省略", () => {
    const long = `${"前".repeat(300)}目标${"后".repeat(300)}`;
    const [hit] = find(long, "目标");
    expect([...hit.blockBefore]).toHaveLength(121);
    expect(hit.blockBefore.startsWith("…")).toBe(true);
    expect([...hit.blockAfter]).toHaveLength(161);
    expect(hit.blockAfter.endsWith("…")).toBe(true);
  });
});

describe("同一段里的命中并成一张卡片", () => {
  it("同段且相隔不远：后一处带上两处之间的文字", () => {
    const hits = find("令夷吾握筹，鄴侯司券，鄴下诸生皆以为得人。", "鄴");
    expect(hits.map((hit) => hit.joinGap)).toEqual([null, "侯司券，"]);
    expect(groupByBlock(hits.map((hit) => ({ hit }))).map((group) => group.length)).toEqual([2]);
  });

  it("不同段落不并", () => {
    const hits = find("鄴侯在此。\n\n鄴下诸生。", "鄴");
    expect(hits.map((hit) => hit.joinGap)).toEqual([null, null]);
    expect(groupByBlock(hits.map((hit) => ({ hit }))).map((group) => group.length)).toEqual([1, 1]);
  });

  it("同段但相隔太远不并", () => {
    const hits = find(`鄴${"远".repeat(80)}鄴`, "鄴");
    expect(hits.map((hit) => hit.joinGap)).toEqual([null, null]);
  });

  it("段内折行不在中文之间留空格", () => {
    const [hit] = find("天下大乱，\n國勢日蹙，鄴侯北走。", "鄴侯");
    expect(hit.blockBefore).toBe("天下大乱，國勢日蹙，");
  });
});

describe("按标题链归树", () => {
  it("同一标题下的命中归在一起，层级随标题链嵌套", () => {
    const tree = buildTrailTree(find(doc, "鄴"));
    expect(tree.count).toBe(5);
    expect(tree.rootHits).toHaveLength(0);
    expect(tree.children.map((node) => node.title)).toEqual(["鄴城记事"]);
    const root = tree.children[0];
    expect(root.count).toBe(5);
    expect(root.children.map((node) => node.title)).toEqual(["卷一", "卷二", "卷二"]);
    const volumeOne = root.children[0];
    expect(volumeOne.hits).toHaveLength(1);
    expect(volumeOne.children.map((node) => node.title)).toEqual(["条一"]);
    expect(volumeOne.count).toBe(2);
  });

  it("同名但不相邻的标题不合并", () => {
    const root = buildTrailTree(find(doc, "鄴")).children[0];
    const [, first, second] = root.children;
    expect(first.title).toBe(second.title);
    expect(first.key).not.toBe(second.key);
    expect(first.hits).toHaveLength(1);
    expect(second.hits).toHaveLength(1);
  });

  it("没有标题的命中挂在根上", () => {
    const tree = buildTrailTree(find("鄴城旧事，鄴侯之名", "鄴"));
    expect(tree.rootHits).toHaveLength(2);
    expect(tree.children).toHaveLength(0);
    expect(tree.count).toBe(2);
  });

  it("空输入得到空树", () => {
    expect(buildTrailTree([])).toEqual({ rootHits: [], children: [], count: 0 });
  });
});
