import { useState } from 'react';
import { DEFAULT_PROVIDERS } from '../../lib/constants';
import { uid } from '../../lib/utils';
import { callAI } from '../../lib/ai';
import { useIsMobile } from '../../lib/hooks';
import SbUserSection from './SbUserSection';
import AddProviderModal from './AddProviderModal';

const SECTIONS = [
  { key: 'llm', label: 'LLM 配置', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
  )},
  { key: 'rules', label: 'AI 写作规则', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
  )},
  { key: 'general', label: '通用设置', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )},
  { key: 'data', label: '账号与数据', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 3.582 3 8 3s8-1 8-3V7M4 7c0 2 3.582 3 8 3s8-1 8-3M4 7c0-2 3.582-3 8-3s8 1 8 3" /></svg>
  )},
];

export default function SettingsPage({ settings, setSettings, currentUser, syncStatus, syncMsg, syncTime, onManualSync, onLogout, setWorkRecords, setWeeklyReports }) {
  const providers = settings.llm.providers || DEFAULT_PROVIDERS;
  const [section, setSection] = useState('llm');
  const [activeId, setActiveId] = useState(providers[0]?.id || '');
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState('');
  const isMobile = useIsMobile();

  const styleRules = settings.styleRules || [];
  const addRule = () => {
    const v = newRule.trim();
    if (!v) return;
    setSettings(prev => ({ ...prev, styleRules: [...(prev.styleRules || []), v].slice(0, 10) }));
    setNewRule('');
  };
  const removeRule = (idx) => {
    setSettings(prev => ({ ...prev, styleRules: (prev.styleRules || []).filter((_, i) => i !== idx) }));
  };

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

  const sectionNav = isMobile ? (
    <div className="flex border-b border-gray-100 overflow-x-auto">
      {SECTIONS.map(s => (
        <button
          key={s.key}
          onClick={() => setSection(s.key)}
          className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${section === s.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
        >
          {s.icon}{s.label}
        </button>
      ))}
    </div>
  ) : (
    <div className="w-44 shrink-0 border-r border-gray-100 p-3 space-y-1">
      {SECTIONS.map(s => (
        <button
          key={s.key}
          onClick={() => setSection(s.key)}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${section === s.key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
        >
          {s.icon}{s.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 h-full overflow-hidden flex ${isMobile ? 'flex-col' : ''}`}>
      {sectionNav}

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <div className="p-6 max-w-4xl">

          {/* ══ LLM 配置 ══ */}
          {section === 'llm' && (
            <div className="fade-in">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-800">LLM 配置</h3>
                  <p className="text-xs text-gray-400 mt-0.5">配置 AI 生成周报/月报使用的大模型服务</p>
                </div>
                <button onClick={() => setShowAddModal(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-400 px-3 py-1.5 rounded-lg transition-colors">
                  <span className="text-base leading-none">+</span> 添加
                </button>
              </div>

              {/* provider 标签页 */}
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
                <div className="space-y-4">
                  <div className={`grid gap-3 ${isMobile ? 'grid-cols-1' : 'grid-cols-2'}`}>
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
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
                      <input
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        placeholder="model-name"
                        value={activeCfg.model || ''}
                        onChange={e => updateProvider(activeId, 'model', e.target.value)}
                      />
                    </div>
                    <div className={isMobile ? '' : 'col-span-2'}>
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
          )}

          {/* ══ AI 写作规则 ══ */}
          {section === 'rules' && (
            <div className="fade-in">
              <h3 className="font-semibold text-gray-800">AI 写作规则</h3>
              <p className="text-xs text-gray-400 mt-0.5 mb-5">
                保存修改过的 AI 报告时，系统会自动对比你的改动并提炼写作规则，之后生成时注入 AI；也可以手动添加。最多 10 条。
              </p>
              <div className="space-y-2">
                {styleRules.length === 0 ? (
                  <div className="text-sm text-gray-300 bg-gray-50 rounded-xl px-4 py-10 text-center">
                    <p className="mb-1">暂无规则</p>
                    <p className="text-xs">修改并保存一份 AI 生成的周报后，规则会自动出现在这里</p>
                  </div>
                ) : styleRules.map((r, idx) => (
                  <div key={idx} className="group flex items-start gap-3 bg-gray-50 rounded-lg px-4 py-3 text-sm text-gray-700">
                    <span className="text-gray-300 shrink-0">{idx + 1}.</span>
                    <span className="flex-1">{r}</span>
                    <button
                      onClick={() => removeRule(idx)}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-lg leading-none shrink-0 transition-opacity"
                    >&times;</button>
                  </div>
                ))}
                <div className="flex gap-2 pt-2">
                  <input
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 min-w-0"
                    placeholder="手动添加规则，如：工作内容用「动词+对象+结果」句式"
                    value={newRule}
                    onChange={e => setNewRule(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addRule(); }}
                  />
                  <button onClick={addRule} className="px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 shrink-0">添加</button>
                  {styleRules.length > 0 && (
                    <button
                      onClick={() => { if (window.confirm('清空全部写作规则？')) setSettings(prev => ({ ...prev, styleRules: [] })); }}
                      className="px-3 py-2 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg shrink-0"
                    >清空</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ══ 通用设置 ══ */}
          {section === 'general' && (
            <div className="fade-in space-y-8">
              <div>
                <h3 className="font-semibold text-gray-800 mb-1">通用设置</h3>
                <p className="text-xs text-gray-400 mb-5">所有设置修改后自动保存并同步</p>
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600">每天标准工时（小时）</label>
                  <input
                    type="number" min="1" max="24" step="0.5"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    value={settings.defaultHours}
                    onChange={e => { const v = parseFloat(e.target.value); setSettings({ ...settings, defaultHours: isNaN(v) ? '' : v }); }}
                  />
                  <span className="text-xs text-gray-400">新增工作记录的默认工时</span>
                </div>
              </div>
            </div>
          )}

          {/* ══ 账号与数据 ══ */}
          {section === 'data' && (
            <div className="fade-in space-y-6">
              <SbUserSection
                currentUser={currentUser}
                syncStatus={syncStatus} syncMsg={syncMsg} syncTime={syncTime}
                onManualSync={onManualSync} onLogout={onLogout}
              />

              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-700 space-y-1">
                <p className="font-medium">启用设置云同步（防止 API Key 丢失）</p>
                <p>在 Supabase 控制台 → SQL Editor 中执行以下命令，即可将 API Key 等设置同步到云端：</p>
                <code className="block bg-amber-100 rounded px-2 py-1 font-mono select-all">ALTER TABLE user_data ADD COLUMN IF NOT EXISTS settings JSONB;</code>
              </div>

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
          )}
        </div>
      </div>

      {/* 添加 LLM 弹窗 */}
      {showAddModal && <AddProviderModal onAdd={addProvider} onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
