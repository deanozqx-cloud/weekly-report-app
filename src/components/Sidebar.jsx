export default function Sidebar({ activePage, setActivePage, currentUser }) {
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
    <div className="flex flex-col h-full" style={{width:'68px',background:'linear-gradient(180deg,#1e293b 0%,#0f172a 100%)',flexShrink:0}}>
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-slate-700/50">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-sm shadow-lg" style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)'}}>周</div>
      </div>

      {/* 导航 */}
      <nav className="flex-1 py-4 flex flex-col gap-1 px-2">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all text-xs ${activePage === item.id ? 'text-white shadow-md' : 'text-slate-400 hover:bg-slate-700/60 hover:text-slate-200'}`}
            style={activePage === item.id ? {background:'linear-gradient(135deg,rgba(59,130,246,0.9),rgba(99,102,241,0.8))'} : {}}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>

      {/* 底部用户头像 */}
      <div className="pb-4 flex flex-col items-center">
        <button
          onClick={() => setActivePage('settings')}
          className="w-8 h-8 rounded-full flex items-center justify-center text-white font-semibold text-sm transition-opacity hover:opacity-80"
          style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)'}}
          title={currentUser?.user_metadata?.display_name || currentUser?.email}
        >
          {(currentUser?.user_metadata?.display_name || currentUser?.email || '?')[0].toUpperCase()}
        </button>
      </div>
    </div>
  );
}
