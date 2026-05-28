import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function EditableSelect({ value, options, onChange, onAddOption, placeholder = '选择', className = '' }) {
  const [open, setOpen] = useState(false);
  const [portalStyle, setPortalStyle] = useState({});
  const [custom, setCustom] = useState('');
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handler = e => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (!open) {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) {
        const minW = Math.max(160, rect.width);
        const spaceBelow = window.innerHeight - rect.bottom;
        if (spaceBelow < 240) {
          setPortalStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right, minWidth: minW, zIndex: 9999 });
        } else {
          setPortalStyle({ position: 'fixed', top: rect.bottom + 4, right: window.innerWidth - rect.right, minWidth: minW, zIndex: 9999 });
        }
      }
    }
    setOpen(o => !o);
  };

  const addCustom = () => {
    const v = custom.trim();
    if (!v) return;
    if (!options.includes(v)) onAddOption(v);
    onChange(v);
    setCustom('');
    setOpen(false);
  };

  const dropdown = open && createPortal(
    <div ref={dropdownRef} style={portalStyle} className="bg-white border border-gray-200 rounded-lg shadow-lg">
      <div className="max-h-44 overflow-y-auto">
        {options.map(o => (
          <div key={o}
            className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${o === value ? 'text-blue-600 font-medium bg-blue-50' : 'text-gray-700'}`}
            onMouseDown={e => { e.preventDefault(); onChange(o); setOpen(false); }}
          >{o}</div>
        ))}
      </div>
      <div className="border-t border-gray-100 p-2 flex gap-1">
        <input
          className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-300"
          placeholder="自定义…"
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          onMouseDown={e => e.stopPropagation()}
        />
        <button type="button" onMouseDown={e => { e.preventDefault(); addCustom(); }} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">+</button>
      </div>
    </div>,
    document.body
  );

  return (
    <div ref={triggerRef} className={`relative ${className}`} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={handleToggle}
        className="border border-gray-200 rounded px-2 py-1 text-xs text-left w-full flex items-center justify-between gap-1 bg-white hover:border-blue-300"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value || placeholder}</span>
        <span className="text-gray-400 shrink-0">▾</span>
      </button>
      {dropdown}
    </div>
  );
}
