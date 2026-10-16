# Better Search Result Views

Search tools for people who work with Chinese historical texts in Obsidian. This is an independent plugin; it is not affiliated with [Better Search Views](https://github.com/ivan-lednev/better-search-views) (see Acknowledgements).

- **Variant-aware search.** `鄴` and `邺`, `於` and `于`, `後` and `后` are treated as the same character. The equivalence table is used for searching only; your notes are never rewritten.
- **Search across breaks.** A word that is split by a line break, a page marker like `<!--p.764-->`, an inline HTML tag, a `%%comment%%` or a footnote mark is still found.
- **Two ways to search.**
  - *Find in note*: a floating panel on the note (can take over `Ctrl+F`). It lists every match; click one to jump.
  - *Variant search*: a sidebar panel that searches the current file, the current folder, or the whole vault, and shows the page marker and the nearest heading for each hit.
- **Two result views, switchable on the panel.** *Tree*: file, then the chain of headings, then the paragraph that holds each match with the match highlighted (several matches in one paragraph share one card; headings fold). *Compact*: one line per match. The sidebar starts in tree view, the find-in-note panel in compact view.

No network access, no telemetry, no account. Works on desktop and mobile.

## Usage

The interface is currently in Chinese only (English UI is planned). Command names as they appear in the command palette:

- **文内查找（带结果列表）** (find in note, with result list) opens the floating panel. Selected text is used as the query.
- **查找（异体字、跨页）** (variant search) opens the sidebar. The ribbon search icon does the same.
- **用选中的文字做异体扩展搜索（Obsidian 自带搜索）** rewrites the selected text as a regular expression covering its variants and hands it to Obsidian's built-in search.
- Toggles on the panels: variants, ignore punctuation, cross page markers and line breaks, cross markup.

## Settings

All settings are on one page: custom variant groups (one group per line, e.g. `於于`), the three Unicode Unihan tables (traditional/simplified, z-variants, semantic variants), the result limit, and whether the floating panel takes over `Ctrl+F`.

## Page markers

If your notes are transcriptions of printed books, put `<!--p.N-->` where page N starts. Results then show the page number, and the search can match words that run across a page break.

## Acknowledgements

The tree view of search results follows the idea of [Better Search Views](https://github.com/ivan-lednev/better-search-views) by ivan-lednev (MIT licence), which shows Obsidian's own search results as an outline of heading breadcrumbs. This plugin does not use its code and does not change Obsidian's built-in search, backlinks or embedded queries; it draws its own panels.

## Data and licence

The Unihan variant tables are generated from the Unicode Character Database (Unihan, Unicode License v3; see `THIRD_PARTY_NOTICES.txt`). The plugin is MIT licensed.

## Development

```
npm install
npm run build   # dist/main.js, dist/styles.css, dist/manifest.json
npm test
npx eslint src  # the official Obsidian review rules
npm run unihan -- <Unihan.zip>   # regenerate the Unihan tables
```

---

# 史学检索（简介）

给在 Obsidian 里整理古籍、史料转写的人用的检索插件：

- 按异体对照表把「鄴／邺」「於／于」「後／后」当同一个字找，只用于检索，不改正文。
- 词被换行、`<!--p.764-->` 页码标记、HTML 标签、`%%备注%%`、脚注号切开，照样找得到。
- 两个入口：正文上的**文内查找**面板（可接管 Ctrl+F，列出全部命中）；侧栏的**异体字检索**（当前文件／当前文件夹／全库，结果带页码和所属标题）。

- 结果有两种显示，面板上可切换：**树形**（文件 → 标题链 → 命中所在的段落，同一段里的几处并成一张卡片，标题可折叠）和**紧凑**（一处一行）。侧栏默认树形，文内查找默认紧凑。

不联网、无遥测，电脑和手机都能用。设置集中在一页。树形显示的思路参考了 ivan-lednev 的 Better Search Views（MIT），代码为自己重写，与原作者无关。
