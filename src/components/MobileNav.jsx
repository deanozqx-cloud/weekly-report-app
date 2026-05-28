export default function MobileNav({ activePage, setActivePage }) {
  const items = [
    { id: 'workbench', label: '工作台', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" strokeWidth="2"/><line x1="16" y1="2" x2="16" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="8" y1="2" x2="8" y2="6" strokeWidth="2" strokeLinecap="round"/><line x1="3" y1="10" x2="21" y2="10" strokeWidth="2"/></svg>
    )},
    { id: 'report', label: '周报', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
    )},
    { id: 'summary', label: '汇总', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
    )},
    { id: 'detail', label: '明细', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
    )},
    { id: 'settings', label: '设置', icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
    )},
  ];

  return (
    <div className="mobile-nav fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-100 shadow-lg flex">
      {items.map(item => (
        <button
          key={item.id}
          onClick={() => setActivePage(item.id)}
          className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-xs transition-colors ${activePage === item.id ? 'text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <div className={`p-1 rounded-lg transition-colors ${activePage === item.id ? 'bg-blue-50' : ''}`}>
            {item.icon}
          </div>
          <span className="font-medium">{item.label}</span>
        </button>
      ))}
    </div>
  );
}
