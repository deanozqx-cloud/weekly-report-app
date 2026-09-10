import { escapeCell } from './markdown';

// ─────────────────────────────────────────
// 富文本粘贴 → Markdown
//
// 从 Word / WPS / 企业微信 / OA / 邮件 / 网页复制的内容，剪贴板里同时有
// text/html 和塌掉的 text/plain。直接粘进 textarea 只会拿到后者，表格结构全丢。
// 这里拦下粘贴，把 HTML（或 Excel 的制表符网格）转成 Markdown 再插入。
// ─────────────────────────────────────────

// 单元格：换行折为空格（Markdown 表格单元格承载不了换行），| 交给 escapeCell 转义
const cellText = (el) => escapeCell(el.textContent.replace(/\s+/g, ' ').trim());

// 保留加粗，其余取纯文本
function inlineText(el) {
  const clone = el.cloneNode(true);
  clone.querySelectorAll('b,strong').forEach(b => {
    const t = b.textContent.trim();
    b.replaceWith(t ? `**${t}**` : '');
  });
  return clone.textContent.replace(/\s+/g, ' ').trim();
}

// 合并单元格（colspan/rowspan）无法在 Markdown 里表达，这里按最宽的行补齐空格，
// 结构会跟原表有出入，但不会错位到读不出来
function tableToMarkdown(table) {
  const rows = [...table.querySelectorAll('tr')];
  const grid = rows.map(tr => [...tr.querySelectorAll('th,td')].map(cellText)).filter(r => r.length);
  if (!grid.length) return '';
  const width = Math.max(...grid.map(r => r.length));
  const pad = r => [...r, ...Array(Math.max(0, width - r.length)).fill('')];
  const [head, ...body] = grid;
  const lines = [
    `| ${pad(head).join(' | ')} |`,
    `|${Array(width).fill('------').join('|')}|`,
    ...body.map(r => `| ${pad(r).join(' | ')} |`),
  ];
  return lines.join('\n');
}

const BLOCK_SELECTOR = 'table,p,div,ul,ol,h1,h2,h3,h4,h5,h6,li,tr';

export function htmlToMarkdown(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  doc.querySelectorAll('style,script,meta,link,title').forEach(n => n.remove());

  const out = [];
  const walk = (node) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.replace(/\s+/g, ' ').trim();
        if (t) out.push(t);
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName.toLowerCase();

      if (tag === 'table') { const md = tableToMarkdown(child); if (md) out.push(md); return; }
      if (/^h[1-6]$/.test(tag)) { const t = inlineText(child); if (t) out.push(`## ${t}`); return; }
      if (tag === 'li') { const t = inlineText(child); if (t) out.push(`- ${t}`); return; }
      if (tag === 'br') return;

      // 容器里还有块级元素时继续下钻（Word 会把整篇包在层层 div 里）
      if (child.querySelector(BLOCK_SELECTOR)) { walk(child); return; }
      const t = inlineText(child);
      if (t) out.push(t);
    });
  };
  walk(doc.body);

  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Excel/表格软件复制出的纯文本是制表符网格。要求至少两行、每行制表符数一致，
// 避免把普通含制表符的文本误判成表格
export function tsvToMarkdown(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n').filter(l => l.length);
  if (lines.length < 2) return '';
  const counts = lines.map(l => (l.match(/\t/g) || []).length);
  if (counts[0] < 1 || counts.some(c => c !== counts[0])) return '';
  const grid = lines.map(l => l.split('\t').map(c => escapeCell(c.trim())));
  const width = counts[0] + 1;
  return [
    `| ${grid[0].join(' | ')} |`,
    `|${Array(width).fill('------').join('|')}|`,
    ...grid.slice(1).map(r => `| ${r.join(' | ')} |`),
  ].join('\n');
}

// 粘贴事件 → 要插入的 Markdown；没有可转换的结构时返回 '' 交回浏览器默认粘贴
export function markdownFromPaste(clipboardData) {
  if (!clipboardData) return '';
  const html = clipboardData.getData('text/html');
  const text = clipboardData.getData('text/plain');
  // 只在确实带结构时才接管：纯文本粘贴保持原样，不做多余改写
  if (html && /<(table|h[1-6]|ul|ol)\b/i.test(html)) {
    const md = htmlToMarkdown(html);
    if (md && md !== text.trim()) return md;
    return '';
  }
  return tsvToMarkdown(text);
}

// 在光标处插入文本。用 execCommand 是为了保住浏览器的撤销栈——
// 直接改 value 会让 ⌘Z 撤不回来
export function insertAtCursor(el, value) {
  el.focus();
  if (document.execCommand && document.execCommand('insertText', false, value)) return;
  const { selectionStart: s, selectionEnd: e } = el;
  el.value = el.value.slice(0, s) + value + el.value.slice(e);
  el.selectionStart = el.selectionEnd = s + value.length;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

// 挂到 textarea 的 onPaste 上：onPaste={richPasteHandler}
export function richPasteHandler(e) {
  const md = markdownFromPaste(e.clipboardData);
  if (!md) return false;
  e.preventDefault();
  insertAtCursor(e.target, md);
  return true;
}
