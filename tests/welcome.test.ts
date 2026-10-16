import { describe, expect, it } from "vitest";
import { shouldShowWelcome } from "../src/welcome";
import { DEFAULT_VARIANT_SETTINGS, normalizeVariantSettings, variantsShownFor } from "../src/variants/settings";

describe("功能介绍只弹一次", () => {
  it("没记过弹过的版本号：弹", () => {
    expect(shouldShowWelcome(undefined)).toBe(true);
    expect(shouldShowWelcome(null)).toBe(true);
    expect(shouldShowWelcome(1)).toBe(true);
  });

  it("记过了（不论哪个版本号）：不弹", () => {
    expect(shouldShowWelcome("0.1.0")).toBe(false);
    expect(shouldShowWelcome("0.2.0")).toBe(false);
  });
});

describe("异体字功能显不显示", () => {
  it("设置没选（null）：看界面语言，中文显示，其余隐藏", () => {
    expect(variantsShownFor(null, "zh")).toBe(true);
    expect(variantsShownFor(null, "en")).toBe(false);
  });

  it("设置里明确选了：不管界面语言，听设置的", () => {
    expect(variantsShownFor(true, "en")).toBe(true);
    expect(variantsShownFor(false, "zh")).toBe(false);
  });

  it("默认是 null，存盘里不是布尔值的当作没选", () => {
    expect(DEFAULT_VARIANT_SETTINGS.showVariants).toBeNull();
    expect(normalizeVariantSettings({}).showVariants).toBeNull();
    expect(normalizeVariantSettings({ showVariants: "是" }).showVariants).toBeNull();
    expect(normalizeVariantSettings({ showVariants: false }).showVariants).toBe(false);
    expect(normalizeVariantSettings({ showVariants: true }).showVariants).toBe(true);
  });
});
