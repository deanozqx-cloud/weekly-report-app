import { LONG_TYPES } from './prompts';

export const DEFAULT_SUBJECT_TEMPLATE = '{类型}-{姓名}-{周期}';

// 主题模板占位符 → 实际值。姓名等为空时不留下多余连字符
export function fillSubject(template, report = {}, senderName = '') {
  const typeName = LONG_TYPES[report.type]?.name || '周报';
  return String(template || '')
    .replaceAll('{类型}', typeName)
    .replaceAll('{周期}', report.range || '')
    .replaceAll('{姓名}', senderName || '')
    .replaceAll('{开始}', report.weekStart || '')
    .replaceAll('{结束}', report.weekEnd || '')
    .replaceAll('{年}', (report.weekStart || '').slice(0, 4))
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}
