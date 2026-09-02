import { useState, useRef, useEffect } from 'react';
import { matchContacts, splitAddresses } from '../../lib/mail';

const SEPARATORS = [',', '，', ';', '；'];

// 逗号分隔的收件人输入框 + 通讯录联想。
// 值仍是逗号分隔字符串，与发送接口和设置里的既有结构保持一致，手动输入的路径不受影响。
export default function RecipientInput({ value = '', onChange, contacts = [], placeholder = '' }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const handler = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // 只有最后一个分隔符之后的片段参与联想，前面已填好的地址不受影响
  const sepIdx = Math.max(...SEPARATORS.map(s => value.lastIndexOf(s)));
  const token = value.slice(sepIdx + 1).trim();
  // 排除的是「已经填完的」地址，不含正在输入的这一段——
  // 否则框里预填着某个地址时，它会把自己从候选里排掉，下拉看起来是空的
  const settled = splitAddresses(value.slice(0, sepIdx + 1));
  const suggestions = matchContacts(contacts, token, { exclude: settled });

  // active 可能因输入变化而越界，取值时钳住，避免回车选到空项
  const idx = Math.min(active, Math.max(suggestions.length - 1, 0));
  const visible = open && suggestions.length > 0;

  const insert = email => {
    const head = value.slice(0, sepIdx + 1);
    onChange(`${head}${head ? ' ' : ''}${email}, `);
    setOpen(false);
    setActive(0);
    inputRef.current?.focus();
  };

  const handleKeyDown = e => {
    if (!visible) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((idx + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((idx - 1 + suggestions.length) % suggestions.length); }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insert(suggestions[idx].email); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        ref={inputRef}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {visible && (
        <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 w-full max-h-52 overflow-y-auto scrollbar-thin">
          {suggestions.map((c, i) => (
            <div
              key={c.email}
              className={`flex items-center justify-between gap-3 px-3 py-2 text-sm cursor-pointer ${i === idx ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={e => { e.preventDefault(); insert(c.email); }}
            >
              <span className="truncate">{c.email}</span>
              {c.count > 1 && <span className="text-xs text-gray-400 shrink-0">{c.count} 次</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
