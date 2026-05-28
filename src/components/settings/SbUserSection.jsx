export default function SbUserSection({ currentUser, syncStatus, syncMsg, syncTime, onManualSync, onLogout }) {
  const displayName = currentUser?.user_metadata?.display_name || currentUser?.email || '用户';
  const email = currentUser?.email || '';
  const statusColor = { synced: 'text-green-500', error: 'text-red-400', syncing: 'text-blue-400', loading: 'text-blue-400', idle: 'text-gray-400' };
  const statusLabel = { synced: '✓ 已同步', error: `✗ ${syncMsg}`, syncing: '↻ 同步中…', loading: '↻ 加载中…', idle: '待同步' };

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-gray-700">账号与数据同步</h3>
          <p className="text-xs text-gray-400 mt-0.5">数据存储于 Supabase，多设备自动同步</p>
        </div>
        <div className={`text-xs font-medium ${statusColor[syncStatus]}`}>{statusLabel[syncStatus]}</div>
      </div>

      <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
          {displayName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-gray-800 text-sm">{displayName}</div>
          <div className="text-xs text-gray-400 truncate">{email}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onManualSync}
          disabled={syncStatus === 'syncing' || syncStatus === 'loading'}
          className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {syncStatus === 'syncing' ? '同步中…' : '立即同步'}
        </button>
        {syncTime && (
          <span className="text-xs text-gray-400">上次同步：{syncTime.toLocaleTimeString()}</span>
        )}
        <button
          onClick={onLogout}
          className="ml-auto px-3 py-1.5 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg"
        >
          退出登录
        </button>
      </div>
    </div>
  );
}
