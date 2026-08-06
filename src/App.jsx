import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { DEFAULT_PROVIDERS, defaultSettings } from './lib/constants';
import { today } from './lib/utils';
import { useStorage, useIsMobile } from './lib/hooks';
import { sb, sbSchemaOk, sbLoadAll, sbLoadLegacy, sbSaveLegacy, sbMigrateLegacy, sbSyncDiff } from './lib/supabase';
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
  // 云端分表结构未初始化时回退旧 user_data 模式，并提示执行 supabase/schema.sql
  const [schemaMissing, setSchemaMissing] = useState(false);
  // 上行闸门：仅在初始云端加载成功后才允许上传，避免加载失败时用过期本地数据覆盖云端
  const [cloudReady, setCloudReady] = useState(false);
  const autoSaveTimer = useRef(null);
  const isMounted = useRef(true);
  // 上次已同步到云端的快照（差量同步的比较基准）；null = 尚未同步过，下次全量上传
  const lastSyncedRef = useRef(null);
  // settings 的实时镜像（loadData 合并云端设置时需要同步读取当前值）
  const settingsRef = useRef(settings);
  useEffect(() => { settingsRef.current = settings; }, [settings]);

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

  // 合并云端设置到本地：远端优先，但 apiKey 取非空值、保留本地自定义 provider
  const mergeCloudSettings = (local, remote) => {
    if (!remote) return local;
    const merged = { ...local, ...remote };
    if (remote.llm) {
      const remoteById = {};
      (remote.llm.providers || []).forEach(p => { remoteById[p.id] = p; });
      const localById = {};
      (local.llm?.providers || []).forEach(p => { localById[p.id] = p; });
      const mergedProviders = DEFAULT_PROVIDERS.map(p => {
        const loc = localById[p.id] || {};
        const rem = remoteById[p.id] || {};
        return { ...p, ...loc, ...rem, apiKey: rem.apiKey || loc.apiKey || p.apiKey };
      });
      const defaultIds = new Set(DEFAULT_PROVIDERS.map(p => p.id));
      const customById = {};
      (local.llm?.providers || []).forEach(p => { if (!defaultIds.has(p.id)) customById[p.id] = p; });
      (remote.llm.providers || []).forEach(p => {
        if (!defaultIds.has(p.id)) customById[p.id] = { ...(customById[p.id] || {}), ...p, apiKey: p.apiKey || customById[p.id]?.apiKey || '' };
      });
      Object.values(customById).forEach(p => mergedProviders.push(p));
      merged.llm = { ...local.llm, ...remote.llm, providers: mergedProviders };
    } else {
      merged.llm = local.llm;
    }
    return merged;
  };

  const loadData = useCallback(async () => {
    setSyncStatus('loading');
    try {
      const schemaOk = await sbSchemaOk();
      if (!schemaOk) {
        // 分表未建：回退旧 user_data 模式，保持一切可用
        setSchemaMissing(true);
        const legacy = await sbLoadLegacy();
        if (legacy.workRecords?.length || legacy.weeklyReports?.length) {
          setWorkRecordsRaw(legacy.workRecords || []);
          setWeeklyReportsRaw(legacy.weeklyReports || []);
        }
        if (legacy.settings) setSettingsRaw(prev => mergeCloudSettings(prev, legacy.settings));
        if (isMounted.current) { setCloudReady(true); setSyncStatus('synced'); setSyncTime(new Date()); setSyncMsg(''); }
        return;
      }

      setSchemaMissing(false);
      let data = await sbLoadAll();
      if (data.empty) {
        // 分表为空：尝试从旧 user_data 自动迁移（user_data 保留作备份）
        const legacy = await sbLoadLegacy();
        if (legacy.workRecords?.length || legacy.weeklyReports?.length || legacy.settings) {
          await sbMigrateLegacy(legacy);
          data = await sbLoadAll();
        }
      }
      if (data.empty) {
        // 云端确实没有数据：保留本地现状，下次自动保存时全量上传
        lastSyncedRef.current = null;
      } else {
        setWorkRecordsRaw(data.workRecords);
        setWeeklyReportsRaw(data.weeklyReports);
        const mergedSet = mergeCloudSettings(settingsRef.current, data.settingsFragment);
        setSettingsRaw(mergedSet);
        lastSyncedRef.current = { workRecords: data.workRecords, weeklyReports: data.weeklyReports, settings: mergedSet };
      }
      if (isMounted.current) { setCloudReady(true); setSyncStatus('synced'); setSyncTime(new Date()); setSyncMsg(''); }
    } catch (e) {
      if (isMounted.current) { setCloudReady(false); setSyncStatus('error'); setSyncMsg(`加载失败：${e.message}（已暂停上传，点同步图标重试）`); }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const saveData = useCallback(async (wr, wpr, st) => {
    // 初始加载未成功前禁止上传：此时本地可能是过期副本，上传会覆盖云端较新数据
    if (!cloudReady) return;
    setSyncStatus('syncing');
    try {
      if (schemaMissing) {
        await sbSaveLegacy(wr, wpr, st);
      } else {
        const next = { workRecords: wr, weeklyReports: wpr, settings: st };
        await sbSyncDiff(lastSyncedRef.current, next);
        lastSyncedRef.current = next;
      }
      if (isMounted.current) { setSyncStatus('synced'); setSyncTime(new Date()); setSyncMsg(''); }
    } catch (e) {
      if (isMounted.current) { setSyncStatus('error'); setSyncMsg(e.message); }
    }
  }, [schemaMissing, cloudReady]);

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
        // settings 一并重置：含 API Key/项目档案/里程碑等，防止同一浏览器换账号登录时
        // 上一账号的数据残留并被自动上传到新账号的云端
        setSettingsRaw(defaultSettings);
        lastSyncedRef.current = null;
        setCloudReady(false);
        setSyncStatus('idle');
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // 数据变化时自动保存（防抖 3s）—— 含 settings；cloudReady 闸门防止加载失败后带病上传。
  // deps 含 saveData：schemaMissing/cloudReady 翻转后确保拿到新分支，不对着旧模式保存。
  // 注意不能把 syncStatus 加进 deps（保存本身会翻转状态，会造成保存循环）
  useEffect(() => {
    if (!currentUser || !cloudReady || syncStatus === 'loading') return;
    clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      saveData(workRecords, weeklyReports, settings);
    }, 3000);
    return () => clearTimeout(autoSaveTimer.current);
  }, [workRecords, weeklyReports, settings, currentUser, cloudReady, saveData]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // 同步指示器：普通 JSX 变量而非渲染期定义的组件（避免每次渲染重建组件类型）
  const syncLabel = { loading: '加载中…', syncing: '同步中…', synced: '已同步', error: '同步失败', idle: '' }[syncStatus] || '';
  const syncColor = { loading: 'text-blue-400', syncing: 'text-blue-400', synced: 'text-green-500', error: 'text-red-400', idle: 'text-gray-300' }[syncStatus];
  const syncIcon = { loading: '↻', syncing: '↻', synced: '✓', error: '✗', idle: '○' }[syncStatus];
  const syncSpin = syncStatus === 'loading' || syncStatus === 'syncing';
  const syncIndicator = (
    <div
      className={`flex items-center gap-1.5 text-xs ${syncColor} cursor-pointer`}
      title={syncStatus === 'error' ? syncMsg : syncTime ? `上次同步：${syncTime.toLocaleTimeString()}` : ''}
      onClick={() => cloudReady ? saveData(workRecords, weeklyReports, settings) : loadData()}
    >
      <span className={syncSpin ? 'animate-spin inline-block' : ''}>{syncIcon}</span>
      {!isMobile && <span>{syncLabel}</span>}
    </div>
  );

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
            {syncIndicator}
            <span className="text-xs text-gray-400">{today()}</span>
          </div>
        </div>

        {/* 云端分表未初始化提示（回退旧模式运行中） */}
        {schemaMissing && (
          <div className="px-4 md:px-6 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700">
            云端数据库还在旧结构上运行。请在 Supabase 控制台 → SQL Editor 执行仓库中的 <code className="bg-amber-100 rounded px-1">supabase/schema.sql</code>，刷新后应用会自动迁移数据到新分表结构（旧数据保留作备份）。
          </div>
        )}

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
                onManualSync={() => cloudReady ? saveData(workRecords, weeklyReports, settings) : loadData()}
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
