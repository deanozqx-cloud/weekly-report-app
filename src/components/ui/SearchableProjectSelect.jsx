import { useState, useEffect, useRef } from 'react';

export default function SearchableProjectSelect({ projects, value, onChange, placeholder = '筛选项目…', className = '' }) {
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { setQuery(value || ''); }, [value]);

  const filtered = query
    ? projects.filter(p => p.toLowerCase().includes(query.toLowerCase()))
    : projects;

  const select = p => { onChange(p); setQuery(p); setOpen(false); };
  const clear = () => { onChange(''); setQuery(''); };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-300 bg-white">
        <input
          className="px-3 py-2 text-sm flex-1 focus:outline-none min-w-0"
          placeholder={placeholder}
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(''); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
        {query ? (
          <button onClick={clear} className="px-2 text-gray-400 hover:text-gray-600 shrink-0">×</button>
        ) : (
          <span className="px-2 text-gray-300 shrink-0 text-sm">▾</span>
        )}
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 w-full max-h-52 overflow-y-auto scrollbar-thin">
          {filtered.map(p => (
            <div key={p}
              className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${p === value ? 'text-blue-600 font-medium' : 'text-gray-700'}`}
              onMouseDown={e => { e.preventDefault(); select(p); }}
            >{p}</div>
          ))}
        </div>
      )}
    </div>
  );
}
