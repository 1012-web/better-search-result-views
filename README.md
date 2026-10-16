# Better Search Result Views（汉字检索）

给在 Obsidian 里整理古籍、史料转写的人用的检索插件。本插件独立开发，与 [Better Search Views](https://github.com/ivan-lednev/better-search-views) 没有隶属关系，参考关系见文末「致谢」。

- **异体字当同一个字找。** 「鄴／邺」「於／于」「後／后」互通。对照表只用于检索，不会改你的笔记。
- **切开的词也找得到。** 词被换行、`<!--p.764-->` 页码标记、HTML 标签、`%%备注%%` 或脚注号切开，照样命中。
- **两个入口。**
  - **文内查找**：正文上浮一个面板（可接管 `Ctrl+F`），列出全部命中，点哪条跳哪条。
  - **异体字检索**：侧栏面板，范围可选当前文件、当前文件夹或全库，每条结果带页码标记和所在标题。
- **结果有两种显示，面板上可切换。**
  - **树形**：文件 → 标题链 → 命中所在的段落，命中字高亮；同一段里的几处命中并成一张卡片，标题可折叠。
  - **紧凑**：一处一行。
  - 侧栏默认树形，文内查找默认紧凑。

不联网、无遥测、不需要账号，电脑和手机都能用。界面语言跟随 Obsidian：中文和繁体中文显示中文，其余显示英文。

## 使用

命令面板里的命令名（英文界面下是对应的英文）：

- **文内查找（带结果列表）**：打开正文上的浮动面板；有选中的文字就拿它当查询。
- **查找（异体字、跨页）**：打开侧栏。左侧功能区的搜索图标同样可以打开。
- **用选中的文字做异体扩展搜索（Obsidian 自带搜索）**：把选中的字改写成覆盖其异体的正则，交给 Obsidian 自带搜索。
- **Obsidian 自带的文内查找**：接管 `Ctrl+F` 之后，仍可从这里调出自带的查找条（含替换）。
- 面板上的开关：异体、忽略标点、跨页码与折行、跨标注与注释、结果显示（树形／紧凑）。

## 设置

所有设置在一页里：自定义异体组（一行一组，如 `於于`）、Unicode Unihan 的三张通用表（繁简对应、同字异写、语义异体）、最多列出几处、文内查找是否接管 `Ctrl+F`，以及面板的位置与大小。

## 页码标记

如果你的笔记是古籍或整理本的转写，在第 N 页开始的地方写 `<!--p.N-->`。结果里会显示页码，被页码标记切开的词也能找到。

## 致谢

树形显示的思路参考了 ivan-lednev 的 [Better Search Views](https://github.com/ivan-lednev/better-search-views)（MIT 许可）：它把 Obsidian 自带的搜索结果显示成带标题层级的大纲。本插件没有使用它的代码，自己的两个面板是自己绘制的；只有在设置里打开「Obsidian 自带搜索的树形显示（实验性）」时，才会读取并装饰自带搜索面板（详见下一节），反向链接和嵌入查询不受影响。

## 实验性：Obsidian 自带搜索的树形显示

设置里的「Obsidian 自带搜索的树形显示（实验性）」默认关闭。打开后，Obsidian 自带「搜索」面板里的每条结果前会补上它所在的标题行，按层级缩进，点标题行可折叠或展开它下面的结果。

- 不改变自带搜索的匹配方式和结果内容，只在结果前加标题行、控制显示。
- **它读取自带搜索面板的内部结构**（Obsidian 没有为此提供公开接口），所以 Obsidian 升级后可能失效。失效或出错时会自动撤销并停用，不影响本插件的其他功能。
- 关掉这个开关会立即还原成原样。
- 折叠状态只在当前搜索面板里记着，不写入文件。

## 数据与许可

Unihan 异体表由 Unicode 字符数据库（Unihan，Unicode License v3）生成，详见 `THIRD_PARTY_NOTICES.txt`。本插件以 MIT 许可发布。

## 开发

```
npm install
npm run build   # 生成 dist/main.js、dist/styles.css、dist/manifest.json
npm test
npx eslint src  # 官方的 Obsidian 审查规则
npm run unihan -- <Unihan.zip>   # 重新生成 Unihan 对照表
```

---

# Better Search Result Views (English summary)

Search tools for people who work with Chinese historical texts in Obsidian. An independent plugin, not affiliated with [Better Search Views](https://github.com/ivan-lednev/better-search-views) (see Acknowledgements).

- **Variant-aware search.** `鄴` and `邺`, `於` and `于`, `後` and `后` are treated as the same character. The table is used for searching only; your notes are never rewritten.
- **Search across breaks.** Words split by a line break, a page marker such as `<!--p.764-->`, an inline HTML tag, a `%%comment%%` or a footnote mark are still found.
- **Two panels.** *Find in note* floats over the note and can take over `Ctrl+F`; *Variant search* is a sidebar that searches the current file, the current folder or the whole vault.
- **Two result views, switchable on the panel.** *Tree*: file, then the chain of headings, then the paragraph holding each match with the match highlighted (several matches in one paragraph share a card; headings fold). *Compact*: one line per match.

No network access, no telemetry, no account; works on desktop and mobile. The interface follows Obsidian's language (Chinese, or English otherwise). MIT licence; Unihan data under the Unicode License v3 (see `THIRD_PARTY_NOTICES.txt`).

Acknowledgements: the tree view follows the idea of Better Search Views by ivan-lednev (MIT), which shows Obsidian's own search results as an outline of heading breadcrumbs. This plugin does not use its code and draws its own two panels. An optional, experimental setting (off by default) adds heading levels and folding to the results of Obsidian's built-in Search; it reads that panel's internal structure, so it may stop working after an Obsidian update, in which case it turns itself off. Backlinks and embedded queries are not touched.
