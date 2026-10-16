/** Obsidian 自带的 heading-1 … heading-6 图标：标题行前面用它标出这是几级标题（三处树形显示共用） */
export function headingIconName(level: number): string {
  return `heading-${Math.min(6, Math.max(1, Math.round(level) || 1))}`;
}
