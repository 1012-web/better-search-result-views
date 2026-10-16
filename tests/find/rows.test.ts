import { describe, expect, it } from "vitest";
import { locateInNodes } from "../../src/find/preview";
import { landingY, lineContext, nearestIndex, rowParts, startIndex, statusText, stepIndex } from "../../src/find/rows";
import { DEFAULT_FIND_SETTINGS, normalizeFindSettings, searchOptions } from "../../src/find/settings";
import { DEFAULT_SEARCH_OPTIONS, searchText } from "../../src/variants/search";

const hits = (text: string, query: string) => searchText({ text, query, options: DEFAULT_SEARCH_OPTIONS, table: null });

/** 面板上一行的三段：按命中所在那一行取上下文，再裁成一行 */
const row = (text: string, query: string, nth = 0, maxBefore?: number) => {
  const hit = hits(text, query)[nth];
  return rowParts({ ...lineContext(text, hit.from, hit.to), match: hit.match }, maxBefore);
};
const joined = (parts: { before: string; match: string; after: string }) => parts.before + parts.match + parts.after;

describe("一条命中显示成一行", () => {
  it("命中之前从本句开头起，不带上一句", () => {
    const text = "教材的篇幅有所压缩。但中国古代史头绪繁多，篇幅太小就会变成压缩饼干。";
    expect(row(text, "中国")).toEqual({ before: "但", match: "中国", after: "古代史头绪繁多，篇幅太小就会变成压缩饼干。" });
  });

  it("句末标点后面的引号、括号算上一句的", () => {
    expect(row("他说：“篇幅宜小。”中国古代史却头绪繁多。", "中国").before).toBe("");
  });

  it("本句里命中之前的字太多时只留最后几个、以「…」开头，命中的词不会被挤出面板", () => {
    const parts = row("教材的篇幅要考虑今日高校中国古代史授课时间普遍有所压缩", "中国", 0, 6);
    expect(parts.before).toBe("…考虑今日高校");
    expect(parts.match).toBe("中国");
  });

  it("只显示命中所在的那一行：标题不带上下一段，下一段不带上标题", () => {
    const text = "# 第一章 中国古代史\n\n中国古代史教程的开头。";
    expect(joined(row(text, "中国", 0))).toBe("第一章 中国古代史");
    expect(joined(row(text, "中国", 1))).toBe("中国古代史教程的开头。");
  });

  it("页码锚点、标注标签不混进这一行", () => {
    const text = "## 二、<mark class=\"hl-red\" data-id=\"a1\">中<!--p.28-->国</mark>早期国家的出现及其特点\n\n下一段";
    expect(joined(row(text, "中国"))).toBe("二、中国早期国家的出现及其特点");
  });

  it("命中落在双链里面：两半截的方括号都不显示；带别名的只显示别名", () => {
    expect(joined(row("它首先引起了[[商业革命]]，表现为世界市场的扩大", "革命"))).toBe("它首先引起了商业革命，表现为世界市场的扩大");
    expect(joined(row("[[尼德兰革命]]使西班牙失去了荷兰", "革命"))).toBe("尼德兰革命使西班牙失去了荷兰");
    expect(joined(row("史称[[价格革命（16世纪）|价格革命]]。前面还有[[别的链接]]", "革命"))).toBe("史称价格革命。前面还有别的链接");
    // 整个链接就是命中、链接在命中之外：照旧
    expect(joined(row("见[[商业革命]]一节", "商业革命"))).toBe("见商业革命一节");
    expect(joined(row("[[阿姆斯特丹]]的商业革命", "革命"))).toBe("阿姆斯特丹的商业革命");
  });

  it("==高亮==、~~删除线~~ 的记号不显示", () => {
    expect(joined(row("这就是==价格革命==的由来，~~旧说~~不取", "革命"))).toBe("这就是价格革命的由来，旧说不取");
  });

  it("引用、列表的记号不算进这一行", () => {
    expect(joined(row("> - 中国古代史", "中国"))).toBe("中国古代史");
    expect(joined(row("1. 先秦：中国早期国家", "中国"))).toBe("先秦：中国早期国家");
  });

  it("很长的一段里，往前截到了标签中间也不露出半截标签", () => {
    const text = `${"前".repeat(380)}<mark class="hl-yellow" data-id="b2">术语</mark>之后是中国`;
    expect(row(text, "中国").before).toBe("…前前前前前前前术语之后是");
  });

  it("命中带上它前面最近的页码", () => {
    const [first, second] = hits("<!--p.27-->中国古代史\n\n<!--p.28-->中国早期国家", "中国");
    expect([first.page, second.page]).toEqual([27, 28]);
  });
});

describe("在命中之间走", () => {
  const list = [{ from: 10 }, { from: 50 }, { from: 90 }];

  it("从眼前的位置往后找第一处，后面没有了回到第一处", () => {
    expect(startIndex(list, 0)).toBe(0);
    expect(startIndex(list, 50)).toBe(1);
    expect(startIndex(list, 51)).toBe(2);
    expect(startIndex(list, 91)).toBe(0);
    expect(startIndex([], 5)).toBe(-1);
  });

  it("上一处、下一处到头循环", () => {
    expect(stepIndex(0, 1, 3)).toBe(1);
    expect(stepIndex(2, 1, 3)).toBe(0);
    expect(stepIndex(0, -1, 3)).toBe(2);
    expect(stepIndex(-1, 1, 3)).toBe(0);
    expect(stepIndex(-1, -1, 3)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });

  it("正文改动后接着算离原来最近的一处", () => {
    expect(nearestIndex(list, 52)).toBe(1);
    expect(nearestIndex(list, 1000)).toBe(2);
    expect(nearestIndex([], 5)).toBe(-1);
  });
});

describe("跳过去以后命中落在哪", () => {
  const view = { top: 100, bottom: 900 };

  it("面板不挡时落在正中", () => {
    expect(landingY(view, null)).toBe(500);
    expect(landingY(view, { top: 0, bottom: 90 })).toBe(500);
  });

  it("面板在上方时落到面板下面不远处", () => {
    expect(landingY(view, { top: 108, bottom: 500 })).toBe(596);
    // 下方空档很窄时落在空档正中
    expect(landingY(view, { top: 108, bottom: 800 })).toBe(850);
  });

  it("面板被拖到下方时落在上方空档的正中", () => {
    expect(landingY(view, { top: 600, bottom: 890 })).toBe(350);
  });

  it("面板几乎盖满时不再躲", () => {
    expect(landingY(view, { top: 120, bottom: 880 })).toBe(500);
  });
});

describe("状态文字", () => {
  it("没输入、没找到、有当前那处、列满了", () => {
    expect(statusText(0, -1, false, false)).toBe("");
    expect(statusText(0, -1, false, true)).toBe("没有找到");
    expect(statusText(12, -1, false, true)).toBe("12 处");
    expect(statusText(12, 2, false, true)).toBe("3 / 12 处");
    expect(statusText(1000, 0, true, true)).toBe("1 / 前 1000 处");
  });
});

describe("设置", () => {
  it("缺项补默认、乱填的忽略、条数夹在范围内", () => {
    expect(normalizeFindSettings(null)).toEqual(DEFAULT_FIND_SETTINGS);
    expect(normalizeFindSettings({ takeover: false, showList: "no", maxResults: 9 })).toEqual({ ...DEFAULT_FIND_SETTINGS, takeover: false, maxResults: 50 });
    expect(normalizeFindSettings({ maxResults: 1e9 }).maxResults).toBe(5000);
  });

  it("面板的位置与大小：没拖过是 null 与默认值；记下来的取整、夹在下限以上；高度 0 表示默认", () => {
    const d = normalizeFindSettings({});
    expect([d.panelRight, d.panelTop, d.panelWidth, d.panelHeight]).toEqual([null, 8, 420, 0]);
    const s = normalizeFindSettings({ panelRight: 131.6, panelTop: -5, panelWidth: 100, panelHeight: 90 });
    expect([s.panelRight, s.panelTop, s.panelWidth, s.panelHeight]).toEqual([132, 0, 280, 140]);
    expect(normalizeFindSettings({ panelRight: "左", panelHeight: 0, panelWidth: 1e9 })).toMatchObject({ panelRight: null, panelHeight: 0, panelWidth: 4000 });
  });

  it("交给检索内核的选项不带 OCR 疑字与只搜标题", () => {
    expect(searchOptions({ ...DEFAULT_FIND_SETTINGS, ignorePunct: true })).toEqual({
      variants: true, crossAnchors: true, crossMarkup: true, ignorePunct: true, titlesOnly: false
    });
  });
});

describe("阅读模式：拼接文本里的偏移对回文字节点", () => {
  // 三个文字节点：「中国」「古代」「史」，拼成「中国古代史」
  const starts = [0, 2, 4];

  it("起点落在交界处算后一个节点的开头", () => {
    expect(locateInNodes(starts, 0, false)).toEqual({ node: 0, offset: 0 });
    expect(locateInNodes(starts, 2, false)).toEqual({ node: 1, offset: 0 });
    expect(locateInNodes(starts, 3, false)).toEqual({ node: 1, offset: 1 });
  });

  it("终点落在交界处算前一个节点的末尾", () => {
    expect(locateInNodes(starts, 2, true)).toEqual({ node: 0, offset: 2 });
    expect(locateInNodes(starts, 4, true)).toEqual({ node: 1, offset: 2 });
    expect(locateInNodes(starts, 5, true)).toEqual({ node: 2, offset: 1 });
  });
});
