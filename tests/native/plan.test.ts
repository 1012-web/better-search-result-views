import { describe, expect, it } from "vitest";
import { buildHeadingIndex } from "../../src/variants/search";
import { planMatches, visibilityOf } from "../../src/native/plan";

const doc = [
  "# 鄴城记事", // 0
  "",
  "## 卷一",
  "",
  "令夷吾握筹。",
  "",
  "### 条一",
  "",
  "后来鄴城陷落。",
  "",
  "## 卷二",
  "",
  "威德被于四远。"
].join("\n");

const at = (needle: string) => doc.indexOf(needle);
const title = (item: { title: string }) => item.title;

describe("标题索引", () => {
  const index = buildHeadingIndex(doc);

  it("按位置给出完整的标题链", () => {
    expect(index.trailAt(at("后来")).map(title)).toEqual(["鄴城记事", "卷一", "条一"]);
    expect(index.trailAt(at("威德")).map(title)).toEqual(["鄴城记事", "卷二"]);
  });

  it("第一个标题之前没有链", () => {
    expect(buildHeadingIndex("前言文字\n\n# 标题").trailAt(2)).toEqual([]);
  });
});

describe("补标题行的计划", () => {
  const index = buildHeadingIndex(doc);
  const trails = [at("令夷吾"), at("后来"), at("威德")].map((offset) => index.trailAt(offset));
  const plans = planMatches(trails);

  it("第一条把整条链都补出来", () => {
    expect(plans[0].rows.map((row) => [row.item.title, row.depth])).toEqual([["鄴城记事", 0], ["卷一", 1]]);
  });

  it("后面的只补和上一条不共用的层，深度接着上一层", () => {
    expect(plans[1].rows.map((row) => [row.item.title, row.depth])).toEqual([["条一", 2]]);
    expect(plans[2].rows.map((row) => [row.item.title, row.depth])).toEqual([["卷二", 1]]);
  });

  it("没有标题的结果不补行", () => {
    expect(planMatches([[]])[0].rows).toEqual([]);
  });
});

describe("折叠后的显示", () => {
  const index = buildHeadingIndex(doc);
  const plans = planMatches([at("令夷吾"), at("后来"), at("威德")].map((offset) => index.trailAt(offset)));
  const key = (name: string) => index.trailAt(at(name === "卷一" ? "令夷吾" : name === "条一" ? "后来" : "威德")).find((item) => item.title === name)!.from;

  it("什么都没折叠：全部显示", () => {
    for (const plan of plans) expect(visibilityOf(plan, new Set())).toEqual({ rows: plan.rows.map(() => true), body: true, any: true });
  });

  it("折叠「卷一」：卷一那条只剩行（卷一行本身还在），条一那条整条藏起，卷二不受影响", () => {
    const collapsed = new Set([key("卷一")]);
    expect(visibilityOf(plans[0], collapsed)).toEqual({ rows: [true, true], body: false, any: true });
    expect(visibilityOf(plans[1], collapsed)).toEqual({ rows: [false], body: false, any: false });
    expect(visibilityOf(plans[2], collapsed)).toEqual({ rows: [true], body: true, any: true });
  });

  it("折叠最深一层「条一」：它的行还在，正文藏起", () => {
    expect(visibilityOf(plans[1], new Set([key("条一")]))).toEqual({ rows: [true], body: false, any: true });
  });

  it("折叠最外层：下面所有的行和正文都藏起，只有最外层那一行留着", () => {
    const root = index.trailAt(at("令夷吾"))[0].from;
    const collapsed = new Set([root]);
    expect(visibilityOf(plans[0], collapsed)).toEqual({ rows: [true, false], body: false, any: true });
    expect(visibilityOf(plans[1], collapsed).any).toBe(false);
    expect(visibilityOf(plans[2], collapsed).any).toBe(false);
  });
});
