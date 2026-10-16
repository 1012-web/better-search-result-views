import { describe, expect, it } from "vitest";
import { VariantTable } from "../../src/shared/variants";
import { DEFAULT_SEARCH_OPTIONS, cleanForDisplay, searchText, tokenize, type SearchOptions } from "../../src/variants/search";
import { normalizeVariantSettings } from "../../src/variants/settings";

const table = (() => {
  const t = new VariantTable();
  t.addGroup("鄴邺");
  t.addGroup("𫍲謏");
  return t;
})();

const opts = (patch: Partial<SearchOptions> = {}): SearchOptions => ({ ...DEFAULT_SEARCH_OPTIONS, ...patch });
const find = (text: string, query: string, patch: Partial<SearchOptions> = {}, extra: Partial<Parameters<typeof searchText>[0]> = {}) =>
  searchText({ text, query, options: opts(patch), table, ...extra });

describe("异体等同", () => {
  it("规范字查到异体、异体查到规范字", () => {
    const text = "令夷吾握筹，鄴侯司券。";
    const [hit] = find(text, "邺侯");
    expect(text.slice(hit.from, hit.to)).toBe("鄴侯");
    expect(find("所藏謏闻随笔", "𫍲闻")).toHaveLength(1);
  });

  it("扩展区字的偏移按 UTF-16 算，正好框住原文", () => {
    const text = "罟里瞿氏所藏𫍲闻随笔";
    const [hit] = find(text, "謏闻");
    expect(text.slice(hit.from, hit.to)).toBe("𫍲闻");
    expect(hit.to - hit.from).toBe(3);
  });

  it("关掉异体等同就只按原字找", () => {
    expect(find("鄴侯", "邺侯", { variants: false })).toHaveLength(0);
    expect(find("鄴侯", "鄴侯", { variants: false })).toHaveLength(1);
  });
});

describe("跨页码锚点与折行", () => {
  const text = "威德被<!--p.764-->于四远";

  it("默认能跨过页码锚点", () => {
    const [hit] = find(text, "被于");
    expect(text.slice(hit.from, hit.to)).toBe("被<!--p.764-->于");
    expect(hit.match).toBe("被于");
  });

  it("关掉后锚点是断点", () => {
    expect(find(text, "被于", { crossAnchors: false })).toHaveLength(0);
    expect(find("甲乙\n丙丁", "乙丙", { crossAnchors: false })).toHaveLength(0);
    expect(find("甲乙\n丙丁", "乙丙")).toHaveLength(1);
  });

  it("页码取命中处之前最近的锚点", () => {
    const [hit] = find("<!--p.763-->前文<!--p.764-->鄴城", "邺城");
    expect(hit.page).toBe(764);
    expect(find("没有锚点的鄴城", "邺城")[0].page).toBeNull();
  });
});

describe("跨标注与注释", () => {
  it("夹在标注标签里的词也能找到，偏移落回原文", () => {
    const text = '前文鄴<mark data-id="x">城</mark>后文';
    const [hit] = find(text, "邺城");
    expect(hit.from).toBe(text.indexOf("鄴"));
    expect(text.slice(hit.to - 1, hit.to)).toBe("城");
    expect(hit.match).toBe("鄴城");
  });

  it("%%备注%%、脚注号不参与比对", () => {
    expect(find("鄴%%备注%%城", "邺城")).toHaveLength(1);
    expect(find("鄴[^3]城", "邺城")).toHaveLength(1);
  });

  it("关掉后标签是断点", () => {
    expect(find('鄴<mark data-id="x">城</mark>', "邺城", { crossMarkup: false })).toHaveLength(0);
  });

  it("双链只比对显示的文字", () => {
    expect(find("见[[某卡片|鄴城]]条", "邺城")).toHaveLength(1);
    expect(find("见[[鄴城]]条", "邺城")).toHaveLength(1);
    expect(find("见[[某卡片|别名]]条", "某卡片")).toHaveLength(0);
  });
});

describe("忽略标点", () => {
  it("默认标点参与比对，勾选后忽略", () => {
    expect(find("乙酉，春", "乙酉春")).toHaveLength(0);
    expect(find("乙酉，春", "乙酉春", { ignorePunct: true })).toHaveLength(1);
    expect(find("乙酉春", "乙酉，春", { ignorePunct: true })).toHaveLength(1);
  });

  it("全角标点与半角当同一个", () => {
    expect(find("按：是书", "按:是书")).toHaveLength(1);
  });
});

describe("存疑字的另一读", () => {
  const text = "清军长驱直人，南都沦亡";
  const at = text.indexOf("人");
  const candidates = [{ from: at, to: at + 1, values: ["入", "人"] }];

  it("给了另一读就按它也算命中，并标出来", () => {
    expect(find(text, "直入")).toHaveLength(0);
    const [hit] = find(text, "直入", {}, { candidates });
    expect(hit.viaCandidate).toBe(true);
    expect(text.slice(hit.from, hit.to)).toBe("直人");
  });

  it("按正文本字命中的不标", () => {
    const [hit] = find(text, "直人", {}, { candidates });
    expect(hit.viaCandidate).toBe(false);
  });
});

describe("只搜书目标题", () => {
  const text = "# 卷一\n\n## 鄴中记一卷 抄本\n\n正文提到鄴中记。\n";

  it("只留标题行里的命中，条目名取所属标题", () => {
    const all = find(text, "邺中记");
    expect(all).toHaveLength(2);
    expect(all[1].entry).toBe("鄴中记一卷 抄本");
    const titles = find(text, "邺中记", { titlesOnly: true });
    expect(titles).toHaveLength(1);
    expect(titles[0].line).toBe(2);
  });
});

describe("其他", () => {
  it("frontmatter 不参与", () => {
    expect(find("---\ntitle: 鄴城\n---\n正文", "邺城")).toHaveLength(0);
  });

  it("空查询、全是空白的查询不出结果；上限起作用；命中互不重叠", () => {
    expect(find("鄴城", "  ")).toHaveLength(0);
    expect(find("甲甲甲甲甲", "甲甲")).toHaveLength(2);
    expect(find("甲甲甲甲甲", "甲", {}, { limit: 3 })).toHaveLength(3);
  });

  it("上下文去掉标签与锚点，各取约 20 字", () => {
    const text = "一二三四五六七八九十一二三四五六七八九十一二三<!--p.9-->鄴城<mark>乙</mark>丙";
    const [hit] = find(text, "邺城");
    expect([...hit.before]).toHaveLength(20);
    expect(hit.after).toBe("乙丙");
  });

  it("切分结果可复用", () => {
    const text = "鄴侯司券";
    const tokens = tokenize(text, opts());
    expect(searchText({ text, query: "邺侯", options: opts(), table, tokens })).toHaveLength(1);
  });

  it("显示清理", () => {
    expect(cleanForDisplay("## **鄴**<!--p.3-->城\n下行")).toBe("鄴城 下行");
  });
});

describe("设置", () => {
  it("缺项与错值退回默认", () => {
    const s = normalizeVariantSettings({ scope: "奇怪", maxResults: 99999, options: { ignorePunct: true, variants: "是" } });
    expect(s.scope).toBe("vault");
    expect(s.maxResults).toBe(5000);
    expect(s.options.ignorePunct).toBe(true);
    expect(s.options.variants).toBe(true);
    expect(s.unihanTradSimp).toBe(true);
  });
});
