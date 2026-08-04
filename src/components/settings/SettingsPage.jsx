import { useState } from 'react';
import { DEFAULT_PROVIDERS, DEFAULT_PROGRESS_OPTIONS } from '../../lib/constants';
import { uid } from '../../lib/utils';
import { callAI } from '../../lib/ai';
import SbUserSection from './SbUserSection';
import AddProviderModal from './AddProviderModal';

export default function SettingsPage({ settings, setSettings, currentUser, syncStatus, syncMsg, syncTime, onManualSync, onLogout, setWorkRecords, setWeeklyReports }) {
  const providers = settings.llm.providers || DEFAULT_PROVIDERS;
  const [activeId, setActiveId] = useState(providers[0]?.id || '');
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saved, setSaved] = useState(false);

  const activeCfg = providers.find(p => p.id === activeId);

  const updateProvider = (id, field, val) => {
    setSettings({
      ...settings,
      llm: {
        ...settings.llm,
        providers: providers.map(p => p.id === id ? { ...p, [field]: val } : p),
      },
    });
  };

  const addProvider = (data) => {
    const newId = uid();
    const newP = { id: newId, label: data.label, apiKey: '', model: data.model || '', baseUrl: data.baseUrl || '', apiType: data.apiType || 'openai' };
    setSettings({ ...settings, llm: { ...settings.llm, providers: [...providers, newP] } });
    setActiveId(newId);
    setShowAddModal(false);
  };

  const deleteProvider = (id) => {
    if (providers.length <= 1) return;
    if (!window.confirm('确定删除该 LLM 配置？')) return;
    const next = providers.filter(p => p.id !== id);
    const newDefault = settings.llm.default === id ? next[0].id : settings.llm.default;
    setSettings({ ...settings, llm: { ...settings.llm, providers: next, default: newDefault } });
    setActiveId(next[0].id);
    setTestResult(r => { const c = {...r}; delete c[id]; return c; });
  };

  const handleTest = async (id) => {
    setTesting(true);
    setTestResult(r => ({ ...r, [id]: '' }));
    try {
      const settingsCopy = { ...settings, llm: { ...settings.llm, default: id } };
      const result = await callAI(settingsCopy, '请回复"连接成功"');
      setTestResult(r => ({ ...r, [id]: `✓ 连接成功：${result.slice(0, 40)}` }));
    } catch (e) {
      setTestResult(r => ({ ...r, [id]: `✗ ${e.message}` }));
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 max-w-2xl h-full overflow-y-auto scrollbar-thin">
      <div className="p-6 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800 text-lg">设置</h2>
      </div>

      <div className="p-6 space-y-8">

        {/* ── LLM 配置 ── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-gray-700">LLM 配置</h3>
            <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors">
              <span className="text-base leading-none">+</span> 添加
            </button>
          </div>

          {/* 标签页 */}
          <div className="flex gap-1 flex-wrap border-b border-gray-200 mb-5">
            {providers.map(p => (
              <button
                key={p.id}
                onClick={() => { setActiveId(p.id); }}
                className={`relative px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${activeId === p.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                {p.label}
                {p.id === settings.llm.default && (
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" title="默认"></span>
                )}
                {p.apiKey && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="已配置"></span>}
              </button>
            ))}
          </div>

          {/* 编辑表单 */}
          {activeCfg && (
            <div className="space-y-4 fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">显示名称</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={activeCfg.label}
                    onChange={e => updateProvider(activeId, 'label', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">接口类型</label>
                  <select
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={activeCfg.apiType || 'openai'}
                    onChange={e => updateProvider(activeId, 'apiType', e.target.value)}
                  >
                    <option value="openai">OpenAI 兼容</option>
                    <option value="claude">Claude (Anthropic)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">API Key</label>
                <input
                  type="password"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="sk-..."
                  value={activeCfg.apiKey || ''}
                  onChange={e => updateProvider(activeId, 'apiKey', e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="model-name"
                    value={activeCfg.model || ''}
                    onChange={e => updateProvider(activeId, 'model', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
                  <input
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    placeholder="https://api.example.com/v1"
                    value={activeCfg.baseUrl || ''}
                    onChange={e => updateProvider(activeId, 'baseUrl', e.target.value)}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-1">
                <button
                  onClick={() => handleTest(activeId)}
                  disabled={testing || !activeCfg.apiKey}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  {testing ? '测试中...' : '测试连接'}
                </button>
                {settings.llm.default !== activeId ? (
                  <button
                    onClick={() => setSettings({ ...settings, llm: { ...settings.llm, default: activeId } })}
                    className="px-3 py-1.5 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"
                  >
                    设为默认
                  </button>
                ) : (
                  <span className="px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg border border-blue-200">当前默认 ✓</span>
                )}
                {providers.length > 1 && (
                  <button
                    onClick={() => deleteProvider(activeId)}
                    className="ml-auto px-3 py-1.5 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 rounded-lg"
                  >
                    删除
                  </button>
                )}
              </div>

              {testResult[activeId] && (
                <div className={`text-sm px-3 py-2 rounded-lg ${testResult[activeId].startsWith('✓') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {testResult[activeId]}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 账号与数据同步 ── */}
        <SbUserSection
          currentUser={currentUser}
          syncStatus={syncStatus} syncMsg={syncMsg} syncTime={syncTime}
          onManualSync={onManualSync} onLogout={onLogout}
        />

        {/* ── 设置云同步提示 ── */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 space-y-1">
          <p className="font-medium">启用设置云同步（防止 API Key 丢失）</p>
          <p>在 Supabase 控制台 → SQL Editor 中执行以下命令，即可将 API Key 等设置同步到云端：</p>
          <code className="block bg-amber-100 rounded px-2 py-1 font-mono select-all">ALTER TABLE user_data ADD COLUMN IF NOT EXISTS settings JSONB;</code>
        </div>

        {/* ── 默认工时 ── */}
        <div>
          <h3 className="font-medium text-gray-700 mb-3">默认工时设置</h3>
          <div className="flex items-center gap-3">
            <label className="text-sm text-gray-600">每天标准工时（小时）</label>
            <input
              type="number" min="1" max="24" step="0.5"
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={settings.defaultHours}
              onChange={e => { const v = parseFloat(e.target.value); setSettings({ ...settings, defaultHours: isNaN(v) ? '' : v }); }}
            />
          </div>
        </div>

        <button onClick={handleSave} className={`px-6 py-2 text-sm rounded-lg font-medium ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {saved ? '已保存 ✓' : '保存设置'}
        </button>

        {/* ── 数据管理 ── */}
        <div className="border-t border-gray-100 pt-5">
          <h3 className="font-medium text-gray-700 mb-1">数据管理</h3>
          <p className="text-xs text-gray-400 mb-3">清空后数据将同步删除，无法恢复，请谨慎操作</p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => { if (window.confirm('确定清空全部工作记录？此操作不可恢复。')) { setWorkRecords([]); } }}
              className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
            >清空工作记录</button>
            <button
              onClick={() => { if (window.confirm('确定清空全部周报？此操作不可恢复。')) { setWeeklyReports([]); } }}
              className="px-4 py-2 text-sm border border-red-200 text-red-500 rounded-lg hover:bg-red-50"
            >清空周报</button>
            <button
              onClick={() => { if (window.confirm('确定清空全部数据（工作记录 + 周报）？此操作不可恢复。')) { setWorkRecords([]); setWeeklyReports([]); } }}
              className="px-4 py-2 text-sm bg-red-50 border border-red-300 text-red-600 rounded-lg hover:bg-red-100 font-medium"
            >清空全部数据</button>
          </div>
        </div>
      </div>

      {/* 添加 LLM 弹窗 */}
      {showAddModal && <AddProviderModal onAdd={addProvider} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
