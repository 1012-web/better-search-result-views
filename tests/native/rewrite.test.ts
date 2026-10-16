import { describe, expect, it } from "vitest";
import { rewriteQuery } from "../../src/native/rewrite";
import { DEFAULT_SEARCH_OPTIONS, type SearchOptions } from "../../src/variants/search";
import { VariantTable } from "../../src/shared/variants";

const OFF: SearchOptions = { variants: false, crossAnchors: false, crossMarkup: false, ignorePunct: false, titlesOnly: false };
const opts = (patch: Partial<SearchOptions>): SearchOptions => ({ ...OFF, ...patch });

const table = (() => {
  const t = new VariantTable();
  t.addGroup("鄴邺");
  t.addGroup("𫍲謏");
  return t;
})();

/** 取出改写后查询里的第 n 个 /正则/，按 Obsidian 自带搜索的规则（不带 u、逐行）编译 */
function regexAt(query: string, n = 0): RegExp {
  const found = [...query.matchAll(/\/((?:\\.|[^/\\])*)\//g)];
  expect(found.length, `查询里要有第 ${n + 1} 个正则：${query}`).toBeGreaterThan(n);
  return new RegExp(found[n][1], "im");
}

describe("什么都没勾：原样交给自带搜索", () => {
  it("不改写", () => {
    expect(rewriteQuery("鄴城", OFF, table)).toEqual({ query: "鄴城", changed: false, skipped: false });
  });

  it("空查询不改写", () => {
    expect(rewriteQuery("   ", DEFAULT_SEARCH_OPTIONS, table).query).toBe("   ");
    expect(rewriteQuery("", DEFAULT_SEARCH_OPTIONS, table).changed).toBe(false);
  });
});

describe("异体字等同", () => {
  it("有异体的字展开成字符组，没有的原样", () => {
    expect(rewriteQuery("鄴侯", opts({ variants: true }), table).query).toBe("/[邺鄴]侯/");
  });

  it("扩展区的字不能放进方括号（自带搜索的正则不带 u 标志），改写成分支", () => {
    expect(rewriteQuery("謏闻", opts({ variants: true }), table).query).toBe("/(?:謏|𫍲)闻/");
  });

  it("没有对照表，或者这个词里没有异体，就不改写（原样交给自带搜索）", () => {
    expect(rewriteQuery("鄴侯", opts({ variants: true }), null)).toEqual({ query: "鄴侯", changed: false, skipped: false });
    expect(rewriteQuery("某某", opts({ variants: true }), table).changed).toBe(false);
  });

  it("正则里的特殊字符要转义", () => {
    expect(rewriteQuery("鄴.一", opts({ variants: true }), table).query).toBe("/[邺鄴]\\.一/");
    expect(rewriteQuery("鄴/一", opts({ variants: true }), table).query).toBe("/[邺鄴]\\/一/");
  });

  it("改写后的正则真能匹配两种写法", () => {
    const re = regexAt(rewriteQuery("邺侯", opts({ variants: true }), table).query);
    expect(re.test("鄴侯司券")).toBe(true);
    expect(re.test("邺侯北走")).toBe(true);
    expect(re.test("某侯")).toBe(false);
  });
});

describe("跨页码与折行", () => {
  const q = rewriteQuery("威德被于四远", opts({ crossAnchors: true }), table).query;

  it("字与字之间允许夹页码标记", () => {
    expect(regexAt(q).test("威德被<!--p.21-->于四远")).toBe(true);
    expect(regexAt(q).test("威德被<!-- p.-3 -->于四远")).toBe(true);
  });

  it("字与字之间允许夹折行和空白", () => {
    expect(regexAt(q).test("威德被\n于四远")).toBe(true);
    expect(regexAt(q).test("威德被 于四远")).toBe(true);
  });

  it("词的前后不加缝隙，不会把前后文也吃进去", () => {
    const re = regexAt(q);
    expect(re.exec("前文 威德被于四远 后文")?.[0]).toBe("威德被于四远");
  });

  it("没勾「跨标注与注释」时，夹别的注释或标签不算", () => {
    expect(regexAt(q).test("威德被<!--别的注释-->于四远")).toBe(false);
    expect(regexAt(q).test("威德被<span>于</span>四远")).toBe(false);
  });
});

describe("跨标注与注释", () => {
  const q = rewriteQuery("威德被", opts({ crossMarkup: true }), table).query;

  it("允许夹 HTML 标签、%%备注%%、脚注号和别的注释", () => {
    const re = regexAt(q);
    expect(re.test("威<mark>德</mark>被")).toBe(true);
    expect(re.test("威%%备注%%德被")).toBe(true);
    expect(re.test("威德[^1]被")).toBe(true);
    expect(re.test("威<!--别的注释-->德被")).toBe(true);
  });

  it("只勾它、没勾「跨页码与折行」时，页码标记和折行不算", () => {
    const re = regexAt(q);
    expect(re.test("威<!--p.21-->德被")).toBe(false);
    expect(re.test("威\n德被")).toBe(false);
  });

  it("双链的括号和「目标|」不挡着词", () => {
    const re = regexAt(q);
    expect(re.test("威[[德]]被")).toBe(true);
    expect(re.test("威[[某目标|德]]被")).toBe(true);
  });
});

describe("忽略标点", () => {
  const q = rewriteQuery("乙酉春", opts({ ignorePunct: true }), table).query;

  it("字之间夹标点也算", () => {
    const re = regexAt(q);
    expect(re.test("乙酉，春")).toBe(true);
    expect(re.test("乙酉、春")).toBe(true);
    expect(re.test("乙，酉。春")).toBe(true);
  });

  it("不用 \\p{…}（自带搜索不认），用的是明确的标点字符组", () => {
    expect(q).not.toContain("\\p{");
  });

  it("夹汉字不算", () => {
    expect(regexAt(q).test("乙某酉春")).toBe(false);
  });
});

describe("只搜标题", () => {
  const q = rewriteQuery("鄴城", opts({ titlesOnly: true, crossAnchors: true }), table).query;

  it("只命中标题行里的词，正文里的不算", () => {
    const text = "# 鄴城记事\n\n正文里也有鄴城。";
    const found = [...text.matchAll(new RegExp(regexAt(q).source, "gim"))];
    expect(found.map((m) => m.index)).toEqual([2]);
  });

  it("标题不会跨行：不会借「跨折行」把标题行和下一行连起来", () => {
    expect(regexAt(q).test("# 鄴\n城")).toBe(false);
  });

  it("引擎认后行断言时用断言写（高亮只落在词上），不认时退回把标题标记算进命中的写法", () => {
    const withLookbehind = rewriteQuery("鄴城", opts({ titlesOnly: true }), table, { lookbehind: true }).query;
    expect(withLookbehind).toContain("(?<=");
    const fallback = rewriteQuery("鄴城", opts({ titlesOnly: true }), table, { lookbehind: false }).query;
    expect(fallback).not.toContain("(?<=");
    const re = regexAt(fallback);
    expect(re.test("# 鄴城记事")).toBe(true);
    expect(re.test("正文里的鄴城")).toBe(false);
    expect(re.exec("## 卷一 鄴城")?.[0]).toBe("## 卷一 鄴城");
  });

  it("不含汉字的词，只勾「只搜标题」时也限制在标题行里", () => {
    const re = regexAt(rewriteQuery("Obsidian", opts({ titlesOnly: true }), table).query);
    expect(re.test("# 关于 Obsidian")).toBe(true);
    expect(re.test("正文 Obsidian")).toBe(false);
  });
});

describe("几项一起勾（默认勾法）", () => {
  const q = rewriteQuery("邺侯北走", { ...OFF, variants: true, crossAnchors: true, crossMarkup: true }, table).query;

  it("异体、页码、标签同时生效", () => {
    const re = regexAt(q);
    expect(re.test("鄴侯<!--p.5-->北<b>走</b>")).toBe(true);
  });

  it("没有嵌套的无限量词（避免在大库里卡死）：每个缝隙只有一层「(?:…)*」", () => {
    expect(q.match(/\)\*/g)?.length).toBe(3);
  });
});

describe("只改写普通的词，高级语法原样放过", () => {
  const on = { ...OFF, variants: true };

  it("操作符连同它的参数原样保留，其余的词照常改写", () => {
    expect(rewriteQuery("path:史料 鄴侯", on, table)).toEqual({ query: "path:史料 /[邺鄴]侯/", changed: true, skipped: true });
    expect(rewriteQuery("tag:#历史 鄴侯", on, table).query).toBe("tag:#历史 /[邺鄴]侯/");
    expect(rewriteQuery('file:"晚明 杂录.md" 鄴侯', on, table).query).toBe('file:"晚明 杂录.md" /[邺鄴]侯/');
    expect(rewriteQuery("line:(鄴 侯) 鄴", on, table).query).toBe("line:(鄴 侯) /[邺鄴]/");
    expect(rewriteQuery("section:(鄴) 鄴", on, table).query).toBe("section:(鄴) /[邺鄴]/");
  });

  it("自己写的正则、属性查询、OR 原样保留", () => {
    expect(rewriteQuery("/鄴.?侯/ 鄴", on, table).query).toBe("/鄴.?侯/ /[邺鄴]/");
    expect(rewriteQuery("[status:done] 鄴", on, table).query).toBe("[status:done] /[邺鄴]/");
    expect(rewriteQuery("鄴 OR 邺", on, table).query).toBe("/[邺鄴]/ OR /[邺鄴]/");
  });

  it("括号、排除符照原位保留，里面的词照常改写", () => {
    expect(rewriteQuery("(鄴 OR 侯) -邺", on, table).query).toBe("(/[邺鄴]/ OR 侯) -/[邺鄴]/");
    expect(rewriteQuery("-path:草稿 鄴", on, table).query).toBe("-path:草稿 /[邺鄴]/");
  });

  it("只有高级语法、没有可改写的词时，不算改写但标出跳过", () => {
    expect(rewriteQuery("tag:#历史", on, table)).toEqual({ query: "tag:#历史", changed: false, skipped: true });
  });

  it("引号里的短语整体改写，里面的空格不算", () => {
    expect(rewriteQuery('"鄴 侯"', on, table).query).toBe("/[邺鄴]侯/");
  });

  it("不含汉字的词、#标签 原样不动", () => {
    expect(rewriteQuery("Obsidian #标签 鄴", on, table).query).toBe("Obsidian #标签 /[邺鄴]/");
  });

  it("引号没配对时，不乱改", () => {
    expect(rewriteQuery('"鄴侯', on, table).query).toBe('"鄴侯');
  });

  it("词之间的空白原样保留", () => {
    expect(rewriteQuery("鄴   侯", on, table).query).toBe("/[邺鄴]/   侯");
  });
});

describe("英文短语：引号里带空格的词，空格处允许夹页码标记和折行", () => {
  const phrase = '"treaty was signed in Paris"';
  const q = rewriteQuery(phrase, opts({ crossAnchors: true }), null).query;

  it("被折行和页码标记切开的短语也找得到，没被切开的照样找得到", () => {
    const re = regexAt(q);
    expect(re.test("the treaty was signed in Paris, and")).toBe(true);
    expect(re.test("the treaty was signed in\n<!--p.22-->\nParis in the spring")).toBe(true);
    expect(re.test("the treaty was signed in<!--p.22-->Paris")).toBe(true);
  });

  it("单词内部不加缝隙：词不会被拆开", () => {
    const re = regexAt(q);
    expect(re.test("the treaty was signed in Par is")).toBe(false);
    expect(re.test("the trea ty was signed in Paris")).toBe(false);
  });

  it("没勾「跨页码与折行」时，页码标记和折行不算", () => {
    const strict = rewriteQuery(phrase, opts({ crossMarkup: true }), null).query;
    expect(regexAt(strict).test("treaty was signed in\n<!--p.22-->\nParis")).toBe(false);
    expect(regexAt(strict).test("treaty was signed in Paris")).toBe(true);
  });

  it("不带引号的几个英文词是自带搜索的「且」，各自单独看，不改写", () => {
    expect(rewriteQuery("treaty signed Paris", opts({ crossAnchors: true }), null)).toEqual({ query: "treaty signed Paris", changed: false, skipped: false });
  });

  it("单个英文词不改写；只勾了异体、没有缝隙可加时，英文短语也不改写", () => {
    expect(rewriteQuery("Paris", opts({ crossAnchors: true }), null).changed).toBe(false);
    expect(rewriteQuery(phrase, opts({ variants: true }), table).changed).toBe(false);
  });
});

describe("中英混排", () => {
  it("英文字母、数字之间不加缝隙，不会让「ab」匹配「a b」", () => {
    const q = rewriteQuery("笔记ab", opts({ crossAnchors: true }), table).query;
    expect(regexAt(q).test("笔 记ab")).toBe(true);
    expect(regexAt(q).test("笔记a b")).toBe(false);
  });
});
