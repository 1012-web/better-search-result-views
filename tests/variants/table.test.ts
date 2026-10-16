import { describe, expect, it } from "vitest";
import { VariantTable, groupChars, parseGroupLines, parseVariantEquivalents, toSearchRegex } from "../../src/shared/variants";
import { UNIHAN_SEMANTIC, UNIHAN_TRAD_SIMP, UNIHAN_Z } from "../../src/shared/unihan-variants";

describe("异体折叠表", () => {
  it("同组的字代表字相同，没登记的字是它自己", () => {
    const table = new VariantTable();
    table.addGroup("鄴邺");
    expect(table.rep("鄴")).toBe(table.rep("邺"));
    expect(table.rep("城")).toBe("城");
    expect(table.members("城")).toEqual(["城"]);
  });

  it("传递合并：甲＝乙、乙＝丙，则甲＝丙", () => {
    const table = new VariantTable();
    table.addGroup("疊叠");
    table.addGroup("叠曡");
    expect(table.rep("疊")).toBe(table.rep("曡"));
    expect(table.members("曡")).toHaveLength(3);
  });

  it("扩展区字按一个字处理（不拆成两半）", () => {
    const table = new VariantTable();
    table.addGroup("𫍲謏");
    expect(table.rep("𫍲")).toBe(table.rep("謏"));
    expect(table.members("謏")).toEqual(["謏", "𫍲"]);
    expect(table.size).toBe(2);
  });

  it("组里的空白与分隔符忽略，少于两个字的组不收", () => {
    expect(groupChars("鄴 ＝ 邺")).toEqual(["鄴", "邺"]);
    expect(parseGroupLines("於于\n\n单\n鄴、邺,  郧｜鄖")).toEqual([["於", "于"], ["鄴", "邺", "郧", "鄖"]]);
  });

  it("字对串按码点两两成对", () => {
    const table = new VariantTable();
    table.addPairs("鄴邺𫍲謏");
    expect(table.rep("𫍲")).toBe(table.rep("謏"));
    expect(table.rep("鄴")).not.toBe(table.rep("謏"));
  });

  it("并入另一张表", () => {
    const a = new VariantTable();
    a.addGroup("鄴邺");
    const b = new VariantTable();
    b.addGroup("邺业");
    a.addTable(b);
    expect(a.rep("鄴")).toBe(a.rep("业"));
  });
});

describe("书的字形表（config.json 的 variantEquivalents）", () => {
  it("正常读取", () => {
    expect(parseVariantEquivalents({ variantEquivalents: ["鷦鹪", "𫄥纚"] })).toEqual([["鷦", "鹪"], ["𫄥", "纚"]]);
  });

  it("缺字段、不是数组、空串、非字符串都不报错", () => {
    expect(parseVariantEquivalents(null)).toEqual([]);
    expect(parseVariantEquivalents({})).toEqual([]);
    expect(parseVariantEquivalents({ variantEquivalents: "鄴邺" })).toEqual([]);
    expect(parseVariantEquivalents({ variantEquivalents: ["", 3, "单", "疊叠"] })).toEqual([["疊", "叠"]]);
  });
});

describe("送进自带搜索的正则", () => {
  it("有异体的字展开成字符组", () => {
    const table = new VariantTable();
    table.addGroup("鄴邺");
    expect(toSearchRegex("邺城", table)).toBe("/[邺鄴]城/");
  });

  it("组里有扩展区字时改用「或」的写法", () => {
    const table = new VariantTable();
    table.addGroup("𫍲謏");
    expect(toSearchRegex("謏闻", table)).toBe("/(?:謏|𫍲)闻/");
  });

  it("正则特殊字符转义，空白去掉；没有表时原样", () => {
    expect(toSearchRegex("a.b (c)", null)).toBe("/a\\.b\\(c\\)/");
    expect(toSearchRegex("   ", null)).toBe("");
  });
});

describe("Unihan 生成的通用表", () => {
  const table = (packed: string) => {
    const t = new VariantTable();
    t.addPairs(packed);
    return t;
  };

  it("字对串长度为偶数（按码点）", () => {
    for (const packed of [UNIHAN_TRAD_SIMP, UNIHAN_Z, UNIHAN_SEMANTIC]) expect([...packed].length % 2).toBe(0);
  });

  it("繁简表覆盖本书照录的异体", () => {
    const t = table(UNIHAN_TRAD_SIMP);
    for (const [a, b] of [["鄴", "邺"], ["𫍲", "謏"], ["疊", "叠"], ["洶", "汹"], ["鷦", "鹪"], ["於", "于"], ["後", "后"]]) {
      expect(t.rep(a), `${a}＝${b}`).toBe(t.rep(b));
    }
  });
});
