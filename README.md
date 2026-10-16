# Hist Search

Search tools for people who work with Chinese historical texts in Obsidian.

- **Variant-aware search.** `鄴` and `邺`, `於` and `于`, `後` and `后` are treated as the same character. The equivalence table is used for searching only; your notes are never rewritten.
- **Search across breaks.** A word that is split by a line break, a page marker like `<!--p.764-->`, an inline HTML tag, a `%%comment%%` or a footnote mark is still found.
- **Two ways to search.**
  - *Find in note*: a floating panel on the note (can take over `Ctrl+F`). It lists every match; click one to jump.
  - *Variant search*: a sidebar panel that searches the current file, the current folder, or the whole vault, and shows the page marker and the nearest heading for each hit.

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

不联网、无遥测，电脑和手机都能用。设置集中在一页。
