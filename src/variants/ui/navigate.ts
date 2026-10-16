/**
 * 跳到一处命中：打开文件（已开着就切过去），编辑模式下选中命中的字并滚到中间，阅读模式下滚到那一行。
 * 只用通用的 workspace 接口，手机上也能用。
 */
import { MarkdownView, TFile, type App, type WorkspaceLeaf } from "obsidian";

function openLeafFor(app: App, path: string): WorkspaceLeaf | null {
  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    const view = leaf.view;
    if (view instanceof MarkdownView && view.file?.path === path) return leaf;
  }
  return null;
}

export async function revealRange(app: App, path: string, from: number, to: number, line: number): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return false;
  let leaf = openLeafFor(app, path);
  if (leaf) app.workspace.setActiveLeaf(leaf, { focus: true });
  else {
    leaf = app.workspace.getLeaf(false);
    await leaf.openFile(file);
  }
  const view = leaf.view;
  if (!(view instanceof MarkdownView)) return false;
  if (view.getMode() === "source") {
    const editor = view.editor;
    const start = editor.offsetToPos(from);
    const end = editor.offsetToPos(to);
    editor.setSelection(start, end);
    editor.scrollIntoView({ from: start, to: end }, true);
    editor.focus();
    return true;
  }
  view.previewMode.applyScroll(line);
  return true;
}
