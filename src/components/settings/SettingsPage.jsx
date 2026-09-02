import { useState } from 'react';
import { DEFAULT_PROVIDERS } from '../../lib/constants';
import { uid } from '../../lib/utils';
import { callAI } from '../../lib/ai';
import { exportJson, exportExcel } from '../../lib/export';
import { sbSendMail } from '../../lib/supabase';
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
  { key: 'templates', label: '报告模板', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  )},
  { key: 'general', label: '通用设置', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  )},
  { key: 'data', label: '账号与数据', icon: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2 3.582 3 8 3s8-1 8-3V7M4 7c0 2 3.582 3 8 3s8-1 8-3M4 7c0-2 3.582-3 8-3s8 1 8 3" /></svg>
  )},
];

export default function SettingsPage({ settings, setSettings, currentUser, syncStatus, syncMsg, syncTime, onManualSync, onLogout, workRecords = [], weeklyReports = [], setWorkRecords, setWeeklyReports }) {
  const providers = settings.llm.providers || DEFAULT_PROVIDERS;
  const [section, setSection] = useState('llm');
  const [activeId, setActiveId] = useState(providers[0]?.id || '');
  const [testResult, setTestResult] = useState({});
  const [testing, setTesting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRule, setNewRule] = useState('');
  const [mailTest, setMailTest] = useState({ state: 'idle', msg: '' });

  const runMailTest = async () => {
    setMailTest({ state: 'testing', msg: '' });
    try {
      const r = await sbSendMail({ mode: 'test', subject: '周报助手 SMTP 测试' });
      setMailTest({ state: 'ok', msg: `✓ 已发送测试邮件到 ${r?.to?.join('、') || '发件邮箱'}，请查收` });
    } catch (e) {
      setMailTest({ state: 'fail', msg: `✗ ${e.message}` });
    }
  };
  const [tplType, setTplType] = useState('half'); // 报告模板页签内：'half' | 'annual'
  const isMobile = useIsMobile();

  const TPL_NAMES = { half: '半年报', annual: '年报' };
  const tpl = settings.reportTemplates?.[tplType] || { sample: '', instructions: '' };
  const updateTemplate = (field, val) => {
    setSettings(prev => ({
      ...prev,
      reportTemplates: {
        ...(prev.reportTemplates || {}),
        [tplType]: { ...(prev.reportTemplates?.[tplType] || { sample: '', instructions: '' }), [field]: val },
      },
    }));
  };

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

          {/* ══ 报告模板（范文） ══ */}
          {section === 'templates' && (
            <div className="fade-in">
              <h3 className="font-semibold text-gray-800">报告模板</h3>
              <p className="text-xs text-gray-400 mt-0.5 mb-4">
                为半年报/年报配置格式范文：粘贴一篇往期报告，AI 生成时会严格模仿其结构、篇幅与文风（长文本格式）。<strong className="text-gray-500">配置了才生效</strong>，不配置则使用默认表格格式。
              </p>

              {/* 类型切换 */}
              <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
                {['half', 'annual'].map(t => {
                  const configured = !!(settings.reportTemplates?.[t]?.sample || '').trim();
                  return (
                    <button
                      key={t}
                      onClick={() => setTplType(t)}
                      className={`px-4 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${tplType === t ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                      {TPL_NAMES[t]}
                      {configured && <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" title="已配置范文"></span>}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-medium text-gray-500">格式范文（粘贴一篇往期{TPL_NAMES[tplType]}原文）</label>
                    <span className={`text-xs ${tpl.sample.length > 8000 ? 'text-amber-600' : 'text-gray-400'}`}>
                      {tpl.sample.length} 字{tpl.sample.length > 8000 ? '（超过 8000 字的部分生成时会被截断）' : ''}
                    </span>
                  </div>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 font-mono"
                    rows={14}
                    placeholder={`把往年的${TPL_NAMES[tplType]}整篇粘贴到这里。\nAI 会模仿它的章节划分、篇幅比例和行文风格，但不会照抄其中的事实和数据。`}
                    value={tpl.sample}
                    onChange={e => updateTemplate('sample', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">格式补充说明（可选）</label>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                    rows={3}
                    placeholder={'额外的格式要求，如：\n分「总体回顾 / 重点项目 / 团队协作 / 明年规划」四部分，每部分 300-500 字，不用表格'}
                    value={tpl.instructions}
                    onChange={e => updateTemplate('instructions', e.target.value)}
                  />
                </div>
                {(tpl.sample || tpl.instructions) && (
                  <button
                    onClick={() => {
                      if (!window.confirm(`清空${TPL_NAMES[tplType]}的范文与说明？`)) return;
                      setSettings(prev => ({ ...prev, reportTemplates: { ...(prev.reportTemplates || {}), [tplType]: { sample: '', instructions: '' } } }));
                    }}
                    className="px-3 py-1.5 text-sm text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >清空{TPL_NAMES[tplType]}模板</button>
                )}
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

              <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-500 space-y-1">
                <p className="font-medium text-gray-600">云端存储结构（v2 分表）</p>
                <p>数据按实体分表存储（工作记录 / 报告 / 版本历史 / 项目 / 里程碑 / 设置），增量同步，只传变更部分。首次使用需在 Supabase 控制台 → SQL Editor 执行仓库中的 <code className="bg-gray-100 rounded px-1">supabase/schema.sql</code>；应用会自动从旧结构迁移数据（旧表保留作备份）。</p>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="font-medium text-gray-700 mb-1">邮件直发（SMTP）</h3>
                <p className="text-xs text-gray-400 mb-3">
                  配置后可在报告页点「发邮件」，预览确认后一键发出。
                  <strong className="text-gray-500">邮箱凭据只存在服务端</strong>，不进浏览器、不进代码仓库。
                </p>
                <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-xs text-gray-600 space-y-2 mb-3">
                  <p className="font-medium text-gray-700">部署步骤（一次性）</p>
                  <p>1. 部署函数：仓库根目录执行 <code className="bg-gray-100 rounded px-1">supabase functions deploy send-mail</code>（需先 <code className="bg-gray-100 rounded px-1">supabase login</code> 与 <code className="bg-gray-100 rounded px-1">supabase link</code>）</p>
                  <p>2. 在 Supabase 控制台 → Edge Functions → send-mail → Secrets 配置：</p>
                  <code className="block bg-gray-100 rounded px-2 py-1.5 font-mono leading-relaxed">
                    SMTP_HOST=&lt;邮件服务器域名&gt;<br />
                    SMTP_PORT=587<br />
                    SMTP_USER=&lt;完整邮箱地址&gt;<br />
                    SMTP_PASS=&lt;密码或客户端授权码&gt;<br />
                    SMTP_FROM_NAME=&lt;发件人显示名，选填&gt;
                  </code>
                  <p className="text-gray-400">
                    尖括号部分要换成你自己的值。<code className="bg-gray-100 rounded px-1">SMTP_FROM_NAME</code> 是收件人看到的发件人名字，
                    <strong className="text-gray-500">不配置就显示邮箱地址</strong>。
                  </p>
                  <p className="text-gray-400">
                    端口 465 用隐式 TLS、587 用 STARTTLS；握手报错可加 <code className="bg-gray-100 rounded px-1">SMTP_TLS=implicit</code> / <code className="bg-gray-100 rounded px-1">starttls</code> 显式指定。
                    服务器完全不支持加密时用 <code className="bg-gray-100 rounded px-1">SMTP_TLS=none</code>（凭据将明文传输）。
                    <strong className="text-amber-600">端口 25 通常被云平台封禁，请优先用 587 或 465。</strong>
                  </p>
                  <p className="text-gray-400">
                    若报「证书域名不匹配」，说明服务器证书签发给了别的域名——用
                    <code className="bg-gray-100 rounded px-1 mx-1">openssl s_client -connect 主机:465</code>
                    查看证书的 CN / SAN，把 SMTP_HOST 改成证书上的那个域名。
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={runMailTest}
                    disabled={mailTest.state === 'testing'}
                    className="px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                  >
                    {mailTest.state === 'testing' ? '测试中…' : '发送测试邮件'}
                  </button>
                  <span className="text-xs text-gray-400">发一封测试邮件到发件邮箱本身，验证整条链路</span>
                </div>
                {mailTest.msg && (
                  <div className={`mt-3 text-sm px-3 py-2 rounded-lg whitespace-pre-wrap ${mailTest.state === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
                    {mailTest.msg}
                  </div>
                )}
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="font-medium text-gray-700 mb-1">数据导出</h3>
                <p className="text-xs text-gray-400 mb-3">
                  当前共 <strong className="text-gray-600">{workRecords.length}</strong> 条工作记录、
                  <strong className="text-gray-600">{weeklyReports.length}</strong> 份报告。
                  出于安全考虑，导出内容不含 API Key。
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => { try { exportJson(workRecords, weeklyReports, settings); } catch (e) { alert('导出失败：' + e.message); } }}
                    className="px-4 py-2 text-sm border border-blue-200 text-blue-600 rounded-lg hover:bg-blue-50"
                    title="完整备份：工作记录、全部报告（含版本历史）、项目档案、里程碑、写作规则、报告范文"
                  >导出完整备份（JSON）</button>
                  <button
                    onClick={async () => { try { await exportExcel(workRecords, weeklyReports, settings); } catch (e) { alert('导出失败：' + e.message); } }}
                    className="px-4 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50"
                    title="工作记录 / 报告 / 项目 / 里程碑 四张表，便于查阅与二次加工"
                  >导出表格（Excel）</button>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-5">
                <h3 className="font-medium text-gray-700 mb-1">数据管理</h3>
                <p className="text-xs text-gray-400 mb-3">清空后数据将同步删除，无法恢复；建议先用上方「导出完整备份」留一份</p>
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
