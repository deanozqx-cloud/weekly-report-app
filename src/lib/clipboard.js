// 富文本复制：同时写入 text/html 与 text/plain，
// 粘贴到企业微信/邮件/Word 时保留表格结构，粘贴到纯文本环境时退化为 Markdown 原文

export async function copyRichText(html, plain) {
  // 首选 Clipboard API（需要 https 或 localhost）
  try {
    if (navigator.clipboard && typeof window.ClipboardItem === 'function') {
      await navigator.clipboard.write([new window.ClipboardItem({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([plain], { type: 'text/plain' }),
      })]);
      return true;
    }
  } catch {
    // 权限被拒或 API 不可用时走下方降级
  }

  // 降级：临时可编辑节点 + execCommand（老浏览器、部分 App 内置 WebView）
  const holder = document.createElement('div');
  holder.setAttribute('contenteditable', 'true');
  holder.innerHTML = html;
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;white-space:normal;';
  document.body.appendChild(holder);
  const sel = window.getSelection();
  const saved = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const range = document.createRange();
  range.selectNodeContents(holder);
  sel.removeAllRanges();
  sel.addRange(range);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* 保持 false */ }
  sel.removeAllRanges();
  if (saved) sel.addRange(saved);
  document.body.removeChild(holder);
  return ok;
}

export async function copyPlainText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 走下方降级
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* 保持 false */ }
  document.body.removeChild(ta);
  return ok;
}
