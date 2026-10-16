/**
 * 界面文字：英文、简体中文两套。跟随 Obsidian 的界面语言（中文、繁体中文用中文，其余用英文）。
 * 控制台日志不翻译，只写英文。
 */
import { getLanguage } from "obsidian";

export type Language = "en" | "zh";

const en = {
  // 公共
  "common.noHeading": "(No heading)",
  "n.firstMatches": "First {n} matches",
  "n.match1": "1 match",
  "n.matchN": "{n} matches",
  "view.isTree": "Showing a tree. Click for the compact list.",
  "view.isCompact": "Showing the compact list. Click for the tree.",
  "status.none": "No matches",

  // 命令
  "cmd.welcome": "Show feature guide",
  "cmd.findOpen": "Find in note (with result list)",
  "cmd.findCore": "Obsidian built-in find in note",

  // 文内查找面板
  "find.title": "Find",
  "find.close": "Close (Esc)",
  "find.placeholder": "Find in this note",
  "find.clear": "Clear",
  "find.prev": "Previous match (Shift+Enter)",
  "find.next": "Next match (Enter)",
  "find.variants": "Variants",
  "find.variantsTip": "Treat variant characters as the same, for example 邺 and 鄴",
  "find.ignorePunct": "Ignore punctuation",
  "find.ignorePunctTip": "Punctuation is ignored when matching, so 乙酉春 also finds 乙酉，春",
  "find.showList": "Show the result list",
  "find.resize": "Drag to resize",

  // 搜索选项（自带搜索的 ⚙ 菜单里的勾选项）
  "vs.optVariants": "Variants",
  "vs.optVariantsTip": "Treat variant characters as the same, for example 邺 and 鄴. The sources of the table are chosen in settings",
  "vs.optCross": "Across page markers and line breaks",
  "vs.optCrossTip": "Words split by a <!--p.N--> page marker or a line break are still found",
  "vs.optMarkup": "Across markup and comments",
  "vs.optMarkupTip": "Words with highlight tags, %%comments%% or footnote marks in the middle are still found",
  "vs.optPunct": "Ignore punctuation",
  "vs.optPunctTip": "Punctuation is ignored when matching, so 乙酉春 also finds 乙酉，春",
  "vs.optTitles": "Headings only",
  "vs.optTitlesTip": "Only look in heading lines",

  // 对照表来源
  "src.custom": "Custom variant groups",
  "src.tradSimp": "Unihan traditional and simplified",
  "src.z": "Unihan z-variants",
  "src.semantic": "Unihan semantic variants",

  // 异体字检索设置
  "vset.heading": "Search panel",
  "vset.showName": "Variant characters",
  "vset.showDesc": "Treat variant characters such as 鄴 and 邺 as the same when searching Chinese texts. Hidden by default unless Obsidian is set to Chinese.",
  "vset.intro": "When Variants is ticked in the search panel, the variants from the sources below are treated as the same character. The table is only used for searching; your notes are never changed.",
  "vset.customName": "Custom variant groups",
  "vset.customDesc": "One group per line. Characters in a group are variants of each other, for example 於于 or 鄴邺. No separators are needed.",
  "vset.unihanHeading": "General tables (Unicode Unihan)",
  "vset.tsName": "Traditional and simplified",
  "vset.tsDesc": "About 6,900 pairs such as 鄴/邺, 疊/叠, 於/于 and 後/后. When on, 后 also finds 後.",
  "vset.zName": "Z-variants",
  "vset.zDesc": "About 90 pairs: forms with identical meaning that are only written differently.",
  "vset.semName": "Semantic variants",
  "vset.semDesc": "About 2,200 pairs: related in meaning but not the same character. Broad, so searching one character brings up many unrelated results.",
  "ns.title": "Search enhancement",
  "ns.provider": "Provided by Better Search Result Views.",
  "ns.skipped": "Search operators and /regular expressions/ in the query are used as typed, and are not affected by the options above.",
  "vset.nativeName": "Enhance Obsidian search",
  "vset.nativeDesc": "Adds a group of search options (variants, across page markers and line breaks, and more) to the settings menu of Obsidian's built-in Search and shows the results as a tree of headings. The options rewrite the words you type into a regular expression only while searching; the search box itself is left alone. It reads the internal structure of that panel, so it may stop working after an Obsidian update; if that happens it turns itself off and nothing else is affected. On by default; turn it off here and Obsidian's search goes back to normal.",
  "vset.current": "Current table",
  "vset.counting": "Counting…",
  "vset.noSources": "No sources: ticking Variants will not fold anything.",
  "vset.sourceGroups": "{label}: {n} groups",
  "vset.sourceError": "{label}: {error}",
  "vset.total": "{n} characters registered in total",

  // 文内查找设置
  "fset.heading": "Find in note",
  "fset.intro": "A find panel floats over the note: type to search this note, see every match listed below, and click one to jump to it. The toggles for punctuation and the result list are on the panel and remember your last choice.",
  "fset.takeoverName": "Take over Ctrl+F",
  "fset.takeoverDesc": "Pressing Ctrl+F in a note (Obsidian's built-in find in current file) opens this panel. When off, Ctrl+F goes back to the built-in find bar, and this panel opens from the command Find in note (with result list). The built-in find bar, including replace, is always available from the command Obsidian built-in find in note.",
  "fset.crossName": "Across page markers and line breaks",
  "fset.crossDesc": "Words split by a <!--p.N--> page marker or a line break are still found.",
  "fset.markupName": "Across markup and comments",
  "fset.markupDesc": "Words with highlight tags, %%comments%% or footnote marks in the middle are still found.",
  "fset.maxName": "Maximum matches listed",
  "fset.maxDesc": "{min} to {max}. A common character can have over a thousand matches in one note, and a long list makes the panel slow.",
  "fset.layoutName": "Panel position and size",
  "fset.layoutDesc": "Drag the title bar to move the panel and drag the bottom-left corner to resize it. Where you leave it is remembered after a restart. This resets it to the default top-right position and size.",
  "fset.reset": "Reset to default",

  "welcome.title": "Welcome to Better Search Result Views",
  "welcome.intro": "This plugin improves how Obsidian shows search results, in two places:",
  "welcome.sectionFind": "Find in note: all matches in one view",
  "welcome.sectionFindText": "Press Ctrl+F in a note. A floating panel lists every match under its headings; click one and the note jumps to it and highlights it. Obsidian's own Ctrl+F marks one match at a time.",
  "welcome.sectionSide": "Better built-in sidebar search",
  "welcome.sectionSideText": "Obsidian's own sidebar Search shows its results as a heading tree, and clicking a result jumps as usual. Its ⚙ menu gets a Search enhancement group of options (on by default; switch it off in settings). In each pair below, the left is the built-in search and the right is with search enhancement on.",
  "welcome.cmpCrossTitle": "Words split by a page marker",
  "welcome.cmpCrossText": "Search for \"treaty was signed in Paris\". The enhancement also finds the one split by a line break and a <!--p.22--> page marker.",
  "welcome.cmpVariantsTitle": "Variant characters",
  "welcome.cmpVariantsText": "Search for 邺侯. The enhancement also counts 鄴侯.",
  "welcome.cmpTreeTitle": "Results grouped by heading",
  "welcome.cmpTreeText": "Search for \"treaty\". Results sit under their headings, and each heading can be folded.",
  "welcome.cmpFindTitle": "Search for \"council\": one at a time, or all by heading",
  "welcome.cmpFindText": "Top: Obsidian's own Ctrl+F. Bottom: this plugin's find in note.",
  "welcome.later": "You can open this guide again from the command palette: Show feature guide.",
  "welcome.enable": "Turn on search enhancement",
  "welcome.enabled": "Search enhancement is on. Open Obsidian's Search and click the ⚙ button.",
  "welcome.close": "Got it",
  "welcome.settingName": "Feature guide",
  "welcome.settingOpen": "Open"
} as const;

export type MessageKey = keyof typeof en;

const zh: Record<MessageKey, string> = {
  "common.noHeading": "（无标题）",
  "n.firstMatches": "前 {n} 处",
  "n.match1": "1 处",
  "n.matchN": "{n} 处",
  "view.isTree": "现在是树形显示，点一下换成紧凑列表",
  "view.isCompact": "现在是紧凑列表，点一下换成树形显示",
  "status.none": "没有找到",

  "cmd.welcome": "查看功能介绍",
  "cmd.findOpen": "文内查找（带结果列表）",
  "cmd.findCore": "Obsidian 自带的文内查找",

  "find.title": "查找",
  "find.close": "关闭（Esc）",
  "find.placeholder": "在本篇里找",
  "find.clear": "清空",
  "find.prev": "上一处（Shift+Enter）",
  "find.next": "下一处（Enter）",
  "find.variants": "异体",
  "find.variantsTip": "异体字等同：按对照表把异体当同一个字（邺＝鄴）",
  "find.ignorePunct": "忽略标点",
  "find.ignorePunctTip": "标点不参与比对：「乙酉春」也能找到「乙酉，春」",
  "find.showList": "显示查找结果列表",
  "find.resize": "按住拖动：拉宽、拉高",

  "vs.optVariants": "异体字等同",
  "vs.optVariantsTip": "按对照表把异体当同一个字（邺＝鄴）；对照表来源在设置里选",
  "vs.optCross": "跨页码与折行",
  "vs.optCrossTip": "词被 <!--p.N--> 页码锚点或换行切开时照样能搜到",
  "vs.optMarkup": "跨标注与注释",
  "vs.optMarkupTip": "词中间夹着高亮标签、%%备注%%、脚注号时照样能搜到",
  "vs.optPunct": "忽略标点",
  "vs.optPunctTip": "标点不参与比对：「乙酉春」也能搜到「乙酉，春」",
  "vs.optTitles": "只搜标题",
  "vs.optTitlesTip": "只在 # 标题行里找",


  "src.custom": "自定义异体组",
  "src.tradSimp": "Unihan 繁简对应",
  "src.z": "Unihan 同字异写",
  "src.semantic": "Unihan 语义异体",

  "vset.heading": "异体字检索",
  "vset.showName": "异体字功能",
  "vset.showDesc": "按异体对照表把「鄴／邺」这类异体字当同一个字搜索。Obsidian 界面不是中文时默认隐藏。",
  "vset.intro": "查找面板里勾选「异体字等同」时，下面各来源的异体当同一个字找。对照表只用于检索，不改正文。",
  "vset.customName": "自定义异体组",
  "vset.customDesc": "一行一组，同组的字互为异体，如「於于」「鄴邺」。字与字之间可以不加分隔。",
  "vset.unihanHeading": "通用对照表（Unicode Unihan）",
  "vset.tsName": "繁简对应",
  "vset.tsDesc": "约 6900 对，如 鄴／邺、疊／叠、於／于、後／后。打开后繁简互通，「后」也会搜到「後」。",
  "vset.zName": "同字异写",
  "vset.zDesc": "约 90 对：字义全同、只是写法不同的字形。",
  "vset.semName": "语义异体",
  "vset.semDesc": "约 2200 对：意义相通但不完全同字，范围宽，搜一个字会冒出不少不相干的结果。",
  "ns.title": "搜索增强",
  "ns.provider": "由「更好的搜索结果展示」提供。",
  "ns.skipped": "查询里的搜索操作符和 /正则/ 按原样使用，不受上面选项的影响。",
  "vset.nativeName": "增强 Obsidian 自带搜索",
  "vset.nativeDesc": "在 Obsidian 自带搜索的设置菜单（搜索框右边的 ⚙）里加一组搜索选项（异体字等同、跨页码与折行等），并把结果显示成标题树。选项只在搜索的那一刻把你输入的词改写成正则，搜索框里的字不动。它会读取自带搜索面板的内部结构，Obsidian 升级后可能失效；失效时会自动停用，不影响其他功能。默认开启；在这里关掉，自带搜索立刻恢复原样。",
  "vset.current": "当前对照表",
  "vset.counting": "统计中……",
  "vset.noSources": "没有任何来源：勾选「异体字等同」也不会折叠。",
  "vset.sourceGroups": "{label}：{n} 组",
  "vset.sourceError": "{label}：{error}",
  "vset.total": "合计登记 {n} 个字",

  "fset.heading": "文内查找",
  "fset.intro": "在正文上浮一个查找面板：输入即搜当前这篇，下面列出全部命中，点哪条跳哪条。「异体」「忽略标点」和结果列表的开关在面板上，会记住上次的选择。",
  "fset.takeoverName": "接管 Ctrl+F",
  "fset.takeoverDesc": "在正文里按 Ctrl+F（Obsidian 自带的「搜索当前文件」）时打开本面板。关掉后 Ctrl+F 回到自带的查找条，本面板从命令「文内查找（带结果列表）」打开。自带的查找条（含替换）随时可以从命令「Obsidian 自带的文内查找」调出。",
  "fset.crossName": "跨页码与折行",
  "fset.crossDesc": "词被 <!--p.N--> 页码锚点或换行切开时照样能找到。",
  "fset.markupName": "跨标注与注释",
  "fset.markupDesc": "词中间夹着高亮标签、%%备注%%、脚注号时照样能找到。",
  "fset.maxName": "最多列出几处",
  "fset.maxDesc": "{min} 到 {max}。一篇里的常用字可能有上千处，列得太多面板会慢。",
  "fset.layoutName": "面板的位置与大小",
  "fset.layoutDesc": "按住面板的标题栏可以拖动，按住左下角可以拉宽、拉高；拖到哪、拉多大都会记住，重启后还在。这里可以恢复成默认的右上角与默认大小。",
  "fset.reset": "恢复默认",

  "welcome.title": "欢迎使用 Better Search Result Views（更好的搜索结果展示）",
  "welcome.intro": "这个插件优化了 Obsidian 的搜索结果展示，分两处：",
  "welcome.sectionFind": "文内查找优化：统一展示文内搜索结果",
  "welcome.sectionFindText": "在笔记里按 Ctrl+F，浮出一个面板，把全部命中按标题层级列出来；点哪条，正文就跳到哪处并高亮。自带的 Ctrl+F 一次只标出一处，要靠上下箭头逐处翻。",
  "welcome.sectionSide": "自带侧栏搜索优化",
  "welcome.sectionSideText": "Obsidian 自带的侧栏搜索，结果显示成标题树，点结果照常跳转；⚙ 菜单里多一组「搜索增强」选项（默认开启，可在设置里关）。下面每组图：左边是自带搜索，右边是开启「搜索增强」之后。",
  "welcome.cmpCrossTitle": "词被页码标记切开",
  "welcome.cmpCrossText": "搜「威德被于四远」。打开后，被 <!--p.21--> 页码标记切开的那一处也找到了。",
  "welcome.cmpVariantsTitle": "异体字等同",
  "welcome.cmpVariantsText": "搜「邺侯」。打开后，写成「鄴侯」的也算。",
  "welcome.cmpTreeTitle": "按标题归类的结果",
  "welcome.cmpTreeText": "搜「鄴城」。结果归在各自的标题下面，每个标题都能折叠。",
  "welcome.cmpFindTitle": "搜「纳谏」：一次一处，还是按标题一览",
  "welcome.cmpFindText": "上图是自带的 Ctrl+F，下图是本插件的文内查找。",
  "welcome.later": "之后随时可以在命令面板里用「查看功能介绍」再看一遍。",
  "welcome.enable": "打开搜索增强",
  "welcome.enabled": "搜索增强已打开。打开 Obsidian 的搜索，点搜索框右边的 ⚙ 就能看到。",
  "welcome.close": "知道了",
  "welcome.settingName": "功能介绍",
  "welcome.settingOpen": "打开"
};

/** 两套文字，供测试核对占位符是否一致 */
export const catalogs: Record<Language, Record<MessageKey, string>> = { en, zh };

let override: Language | null = null;

/** 测试或调试时固定语言；传 null 恢复为跟随 Obsidian */
export function setLanguage(language: Language | null): void {
  override = language;
}

export function currentLanguage(): Language {
  if (override) return override;
  try {
    const code = getLanguage();
    return code === "zh" || code === "zh-TW" ? "zh" : "en";
  } catch {
    return "en";
  }
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template: string = (currentLanguage() === "zh" ? zh : en)[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/** 「3 处」「1 match」：按数量选单复数 */
export function matchesLabel(n: number): string {
  return n === 1 ? t("n.match1") : t("n.matchN", { n });
}
