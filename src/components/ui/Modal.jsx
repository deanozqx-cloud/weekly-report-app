import { useEffect } from 'react';

export default function Modal({ title, onClose, children, width = 'max-w-lg' }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center modal-overlay" style={{background:'rgba(0,0,0,0.4)'}}>
      <div className={`bg-white rounded-xl shadow-2xl w-full mx-4 ${width} fade-in`} style={{maxHeight:'90vh',display:'flex',flexDirection:'column'}}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800 text-lg">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  );
}
