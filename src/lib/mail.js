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

// ── 收件人通讯录 ──
// 发送成功后累积用过的地址，下次输入时联想。只存地址与使用统计，不涉及凭据。

const MAX_CONTACTS = 200;
// 与 Edge Function 的收件人校验保持一致：拦掉明显不是邮箱的输入，不追求 RFC 完备
const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

export const isEmail = s => EMAIL_RE.test(String(s || '').trim());

// to/cc 字段的分隔符集合与 Edge Function 的 normalizeList 一致
export const splitAddresses = text =>
  String(text || '').split(/[,;，；\s]+/).map(s => s.trim()).filter(Boolean);

// 常用优先，同样常用时最近用过的优先
const byUsage = (a, b) =>
  ((b.count || 0) - (a.count || 0)) ||
  String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || ''));

// 把这次用到的地址并入通讯录：老地址累加次数并刷新时间，新地址追加
export function mergeContacts(contacts = [], addresses = []) {
  const byEmail = new Map((contacts || []).filter(c => c?.email).map(c => [c.email, { ...c }]));
  const now = new Date().toISOString();
  addresses.forEach(raw => {
    const email = String(raw || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return;
    const hit = byEmail.get(email);
    if (hit) {
      hit.count = (hit.count || 0) + 1;
      hit.lastUsedAt = now;
    } else {
      byEmail.set(email, { email, count: 1, lastUsedAt: now });
    }
  });
  return [...byEmail.values()].sort(byUsage).slice(0, MAX_CONTACTS);
}

// 子序列匹配：'zqx' 能命中 'zhouqingxian'，用于按首字母或零散片段联想
function isSubsequence(needle, hay) {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

// 关键词模糊匹配通讯录。score 越小越靠前：前缀 < 包含 < 子序列
export function matchContacts(contacts = [], query = '', { limit = 8, exclude = [] } = {}) {
  const skip = new Set(exclude.map(e => String(e).trim().toLowerCase()).filter(Boolean));
  const q = String(query || '').trim().toLowerCase();
  const scored = [];
  (contacts || []).forEach(c => {
    if (!c?.email || skip.has(c.email)) return;
    if (!q) { scored.push({ c, score: 3 }); return; }
    const local = c.email.split('@')[0];
    if (c.email.startsWith(q)) scored.push({ c, score: 0 });
    else if (c.email.includes(q)) scored.push({ c, score: 1 });
    else if (isSubsequence(q, local)) scored.push({ c, score: 2 });
  });
  scored.sort((a, b) => (a.score - b.score) || byUsage(a.c, b.c));
  return scored.slice(0, limit).map(x => x.c);
}
