import { afterEach, describe, expect, it } from "vitest";
import { catalogs, filesLabel, matchesLabel, setLanguage, t, type MessageKey } from "../src/i18n";
import { statusText } from "../src/find/rows";

afterEach(() => setLanguage(null));

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("两套界面文字", () => {
  const keys = Object.keys(catalogs.en) as MessageKey[];

  it("中英文的键完全一致，没有空文字", () => {
    expect(Object.keys(catalogs.zh).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(catalogs.en[key].trim(), `en ${key}`).not.toBe("");
      expect(catalogs.zh[key].trim(), `zh ${key}`).not.toBe("");
    }
  });

  it("同一条的占位符两种语言一致", () => {
    for (const key of keys) expect(placeholders(catalogs.zh[key]), key).toEqual(placeholders(catalogs.en[key]));
  });

  it("英文里不含汉字之外的说明性中文（示例字除外）", () => {
    // 英文界面里只允许出现作为例子的汉字和逗号（异体字、忽略标点的示例），不应出现别的中文标点
    for (const key of keys) expect(catalogs.en[key], key).not.toMatch(/[。；：？！（）「」『』《》、]/u);
  });
});

describe("t 与数量词", () => {
  it("按语言取文字并代入占位符", () => {
    setLanguage("en");
    expect(t("notice.cannotOpen", { path: "a/b.md" })).toBe("Cannot open: a/b.md");
    setLanguage("zh");
    expect(t("notice.cannotOpen", { path: "a/b.md" })).toBe("打不开：a/b.md");
  });

  it("没给的占位符原样留着，不抛错", () => {
    setLanguage("en");
    expect(t("notice.copied")).toBe("Copied: {text}");
  });

  it("英文区分单复数，中文不区分", () => {
    setLanguage("en");
    expect([matchesLabel(1), matchesLabel(6), filesLabel(1), filesLabel(2)]).toEqual(["1 match", "6 matches", "1 file", "2 files"]);
    setLanguage("zh");
    expect([matchesLabel(1), matchesLabel(6), filesLabel(1), filesLabel(2)]).toEqual(["1 处", "6 处", "1 个文件", "2 个文件"]);
  });

  it("状态栏文字随语言变", () => {
    setLanguage("en");
    expect(statusText(12, 2, false, true)).toBe("3 / 12 matches");
    expect(statusText(500, -1, true, true)).toBe("First 500 matches");
    expect(statusText(0, -1, false, true)).toBe("No matches");
    setLanguage("zh");
    expect(statusText(12, 2, false, true)).toBe("3 / 12 处");
    expect(statusText(0, -1, false, true)).toBe("没有找到");
  });
});
