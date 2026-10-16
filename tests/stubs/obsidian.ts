// vitest 用的 obsidian 桩：只提供纯函数模块会碰到的导出
import { StateField } from "@codemirror/state";

export const editorLivePreviewField = StateField.define<boolean>({
  create: () => true,
  update: (v) => v
});

export const editorInfoField = StateField.define<{ file: { path: string } | null }>({
  create: () => ({ file: null }),
  update: (v) => v
});

export class Notice {
  constructor(public message: string) {}
}
export class Plugin {}
export class ItemView {}
export class Modal {}
export class PluginSettingTab {}
export class Setting {}
export class MarkdownView {}
export class TFile {}
export class Menu {}
export const Platform = { isMobile: false };
export function setIcon(): void {}
export function normalizePath(p: string): string {
  return p;
}
export function debounce<T extends (...args: never[]) => unknown>(fn: T): T {
  return fn;
}
