/**
 * 功能介绍弹窗里的 before/after 对比图：真实的搜索面板截图，左边是 Obsidian 自带搜索，右边是打开搜索增强以后。
 * 图是中文、英文各一套（样例笔记的语言不同）；异体字那一组只有中文有。
 * 图用 data URI 打进 main.js，因为社区插件只发布 main.js、manifest.json、styles.css 三个文件。
 * 原图和说明见仓库的 assets/guide/。
 */
import type { Language } from "../i18n";
import enCross from "../../assets/guide/en-cross.png";
import enTree from "../../assets/guide/en-tree.png";
import zhCross from "../../assets/guide/zh-cross.png";
import zhTree from "../../assets/guide/zh-tree.png";
import zhVariants from "../../assets/guide/zh-variants.png";

export type GuideId = "cross" | "variants" | "tree";

export const GUIDE_IMAGES: Record<Language, Partial<Record<GuideId, string>>> = {
  zh: { cross: zhCross, variants: zhVariants, tree: zhTree },
  en: { cross: enCross, tree: enTree }
};
