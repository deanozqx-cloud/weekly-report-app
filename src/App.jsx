import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_PROVIDERS, defaultSettings } from './lib/constants';
import { today } from './lib/utils';
import { useStorage, useIsMobile } from './lib/hooks';
import { sb, sbLoad, sbSave } from './lib/supabase';
import AuthPage from './components/auth/AuthPage';
import Sidebar from './components/Sidebar';
import MobileNav from './components/MobileNav';
import WorkbenchPage from './components/workbench/WorkbenchPage';
import WeeklyReportPage from './components/reports/WeeklyReportPage';
import WorkDetailPage from './components/detail/WorkDetailPage';
import ProjectSummaryPage from './components/summary/ProjectSummaryPage';
import SettingsPage from './components/settings/SettingsPage';

export default function App() {
  const [activePage, setActivePage] = useState('workbench');
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const [workRecords, setWorkRecordsRaw] = useStorage('workRecords', []);
  const [weeklyReports, setWeeklyReportsRaw] = useStorage('weeklyReports', []);
  const [settings, setSettingsRaw] = useStorage('settings', defaultSettings);

  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncMsg, setSyncMsg] = useState('');
  const [syncTime, setSyncTime] = useState(null);
  const autoSaveTimer = useRef(null);
  const isMounted = useRef(true);

  useEffect(() => { isMounted.current = true; return () => { isMounted.current = false; }; }, []);

  // 合并设置（兼容旧格式，深合并 providers 确保 apiKey 不被代码更新覆盖）
  const mergedSettings = useMemo(() => {
    const s = { ...defaultSettings, ...settings };
    if (!settings.llm) {
      s.llm = defaultSettings.llm;
    } else if (!settings.llm.providers) {
      const migratedProviders = DEFAULT_PROVIDERS.map(p => ({ ...p, ...(settings.llm[p.id] || {}) }));
      s.llm = { default: settings.llm.default || 'deepseek', providers: migratedProviders };
    } else {
      const storedById = {};
      settings.llm.providers.forEach(p => { storedById[p.id] = p; });
      const mergedProviders = DEFAULT_PROVIDERS.map(p => ({ ...p, ...(storedById[p.id] || {}) }));
      settings.llm.providers.forEach(p => {
        if (!DEFAULT_PROVIDERS.find(d => d.id === p.id)) mergedProviders.push(p);
      });
      s.llm = { ...defaultSettings.llm, ...settings.llm, providers: mergedProviders };
    }
    return s;
  }, [settings]);

  // useStorage 已支持函数式更新，直接透传（避免用渲染期快照解包导致的过期状态覆盖）
  const setWorkRecords = setWorkRecordsRaw;
  const setWeeklyReports = setWeeklyReportsRaw;
  const setSettings = setSettingsRaw;

  const loadData = useCallback(async () => {
    setSyncStatus('loading');
    try {
      const data = await sbLoad();
      if (data) {
        if (data.workRecords)   setWorkRecordsRaw(data.workRecords);
        if (data.weeklyReports) setWeeklyReportsRaw(data.weeklyReports);
        if (data.settings) setSettingsRaw(prev => {
          const remote = data.settings;
          const remoteById = {};
          (remote.llm?.providers || []).forEach(p => { remoteById[p.id] = p; });
          const localById = {};
          (prev.llm?.providers || []).forEach(p => { localById[p.id] = p; });
          const mergedProviders = DEFAULT_PROVIDERS.map(p => {
            const local = localById[p.id] || {};
            const rem = remoteById[p.id] || {};
            return { ...p, ...local, ...rem, apiKey: rem.apiKey || local.apiKey || p.apiKey };
          });
          // 保留用户自行添加的自定义 provider（id 不在 DEFAULT_PROVIDERS 中），远端与本地合并、远端优先
          const defaultIds = new Set(DEFAULT_PROVIDERS.map(p => p.id));
          const customById = {};
          (prev.llm?.providers || []).forEach(p => { if (!defaultIds.has(p.id)) customById[p.id] = p; });
          (remote.llm?.providers || []).forEach(p => {
            if (!defaultIds.has(p.id)) customById[p.id] = { ...(customById[p.id] || {}), ...p, apiKey: p.apiKey || customById[p.id]?.apiKey || '' };
          });
          Object.values(customById).forEach(p => mergedProviders.push(p));
          return { ...prev, ...remote, llm: { ...prev.llm, ...remote.llm, providers: mergedProviders } };
        });
      }
      if (isMounted.current) { setSyncStatus('synced'); setSyncTime(new Date()); setSyncMsg(''); }
    } catch (e) {
      if (isMounted.current) { setSyncStatus('error'); setSyncMsg(e.message); }
    }
  }, []);

  const saveData = useCallback(async (wr, wpr) => {
    setSyncStatus('syncing');
    try {
      await sbSave(wr, wpr, settings);
      if (isMounted.current) { setSyncStatus('synced'); setSyncTime(new Date()); setSyncMsg(''); }
    } catch (e) {
      if (isMounted.current) { setSyncStatus('error'); setSyncMsg(e.message); }
    }
  }, [settings]);

  useEffect(() => {
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        if (session?.user) {
          setCurrentUser(session.user);
          loadData();
        }
        setAuthLoading(false);
      } else if (event === 'TOKEN_REFRESHED' && session?.user) {
        setCurrentUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setCurrentUser(null);
        setWorkRecordsRaw([]);
        setWeeklyReportsRaw([]);
        setSyncStatus('idle');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 数据变化时自动保存（防抖 3s）—— 含 settings，确保 API Key 等配置修改也会自动云同步
  useEffect(() => {
    if (!currentUser || syncStatus === 'loading') return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveData(workRecords, weeklyReports);
    }, 3000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [workRecords, weeklyReports, settings]);

  const handleLogin = (user) => {
    setCurrentUser(user);
    loadData();
  };

  const handleLogout = async () => {
    if (!window.confirm('确定退出登录？')) return;
    await sb.auth.signOut();
  };

  const isMobile = useIsMobile();

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">加载中…</div>
      </div>
    );
  }

  if (!currentUser) return <AuthPage onLogin={handleLogin} />;

  const pageTitle = { workbench: '工作台', report: '周报管理', detail: '工作明细', summary: '项目汇总', settings: '设置' };

  const SyncIndicator = () => {
    const label = { loading: '加载中…', syncing: '同步中…', synced: '已同步', error: '同步失败', idle: '' }[syncStatus] || '';
    const color = { loading: 'text-blue-400', syncing: 'text-blue-400', synced: 'text-green-500', error: 'text-red-400', idle: 'text-gray-300' }[syncStatus];
    const icon = { loading: '↻', syncing: '↻', synced: '✓', error: '✗', idle: '○' }[syncStatus];
    const spin = syncStatus === 'loading' || syncStatus === 'syncing';
    return (
      <div
        className={`flex items-center gap-1.5 text-xs ${color} cursor-pointer`}
        title={syncStatus === 'error' ? syncMsg : syncTime ? `上次同步：${syncTime.toLocaleTimeString()}` : ''}
        onClick={() => saveData(workRecords, weeklyReports)}
      >
        <span className={spin ? 'animate-spin inline-block' : ''}>{icon}</span>
        {!isMobile && <span>{label}</span>}
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {!isMobile && <Sidebar activePage={activePage} setActivePage={setActivePage} currentUser={currentUser} />}

      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
        {/* 顶部 */}
        <div className="h-14 flex items-center px-4 md:px-6 bg-white border-b border-gray-100 shadow-sm gap-4">
          {isMobile && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0" style={{background:'linear-gradient(135deg,#3b82f6,#6366f1)'}}>周</div>
          )}
          <h1 className="text-base font-semibold text-gray-800">{pageTitle[activePage]}</h1>
          <div className="ml-auto flex items-center gap-3">
            <SyncIndicator />
            <span className="text-xs text-gray-400">{today()}</span>
          </div>
        </div>

        {/* 内容区 */}
        <div className={`flex-1 overflow-hidden p-4 md:p-5 ${isMobile ? 'pb-20' : ''}`}>
          <div className="h-full page-transition" key={activePage}>
            {activePage === 'workbench' && (
              <WorkbenchPage workRecords={workRecords} setWorkRecords={setWorkRecords} settings={mergedSettings} />
            )}
            {activePage === 'report' && (
              <WeeklyReportPage workRecords={workRecords} setWorkRecords={setWorkRecords} weeklyReports={weeklyReports} setWeeklyReports={setWeeklyReports} settings={mergedSettings} setSettings={setSettings} />
            )}
            {activePage === 'detail' && (
              <WorkDetailPage workRecords={workRecords} setWorkRecords={setWorkRecords} />
            )}
            {activePage === 'summary' && (
              <ProjectSummaryPage workRecords={workRecords} setWorkRecords={setWorkRecords} weeklyReports={weeklyReports} settings={mergedSettings} setSettings={setSettings} />
            )}
            {activePage === 'settings' && (
              <SettingsPage
                settings={mergedSettings} setSettings={setSettings}
                currentUser={currentUser}
                syncStatus={syncStatus} syncMsg={syncMsg} syncTime={syncTime}
                onManualSync={() => saveData(workRecords, weeklyReports)}
                onLogout={handleLogout}
                setWorkRecords={setWorkRecords}
                setWeeklyReports={setWeeklyReports}
              />
            )}
          </div>
        </div>
      </div>

      {isMobile && <MobileNav activePage={activePage} setActivePage={setActivePage} />}
    </div>
  );
}
