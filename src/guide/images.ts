/**
 * 功能介绍弹窗里的 before/after 对比图：真实的搜索面板截图，左边是 Obsidian 自带搜索，右边是打开搜索增强以后。
 * 文内查找（find）那一组不同：左边是自带的 Ctrl+F，右边是本插件的文内查找面板，上下排开。
 * 图是中文、英文各一套（样例笔记的语言不同）；异体字那一组只有中文有。
 * 图用 data URI 打进 main.js，因为社区插件只发布 main.js、manifest.json、styles.css 三个文件。
 * README 用同名 PNG；这里嵌入的是体积更小的 WebP（画质 60），由同一批截图生成。
 */
import type { Language } from "../i18n";
import enCross from "../../assets/guide/en-cross.webp";
import enFind from "../../assets/guide/find-en.webp";
import enTree from "../../assets/guide/en-tree.webp";
import zhCross from "../../assets/guide/zh-cross.webp";
import zhFind from "../../assets/guide/find-zh.webp";
import zhTree from "../../assets/guide/zh-tree.webp";
import zhVariants from "../../assets/guide/zh-variants.webp";

export type GuideId = "cross" | "variants" | "tree" | "find";

export const GUIDE_IMAGES: Record<Language, Partial<Record<GuideId, string>>> = {
  zh: { cross: zhCross, variants: zhVariants, tree: zhTree, find: zhFind },
  en: { cross: enCross, tree: enTree, find: enFind }
};
