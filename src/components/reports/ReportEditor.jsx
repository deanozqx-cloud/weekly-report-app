import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_PROVIDERS, DEFAULT_PROGRESS_OPTIONS } from '../../lib/constants';
import { uid } from '../../lib/utils';
import { callAI, distillStyleRules, refineReport } from '../../lib/ai';
import { qualityBlock, buildLongReportPrompt, pickChildReports, isLongType, LONG_TYPES } from '../../lib/prompts';
import { buildMarkdown, parseMarkdownToReport, renderMarkdown } from '../../lib/markdown';
import EditableSelect from '../ui/EditableSelect';

export default function ReportEditor({ report, onSave, settings, setSettings, weeklyReports = [], workRecords = [], setWorkRecords }) {
  // 长周期报告（月报/季报/半年报/年报）：只用 Markdown 模式编辑（结构化表格是周报专属）
  const isLong = isLongType(report.type);
  const [items, setItems] = useState(report.items || []);
  const [nextItems, setNextItems] = useState(report.nextItems || []);
  const [markdown, setMarkdown] = useState(report.markdown || '');
  const [mdMode, setMdMode] = useState(isLong);
  const [mdPreview, setMdPreview] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [aiError, setAiError] = useState('');
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(null);
  const availableProviders = settings?.llm?.providers || DEFAULT_PROVIDERS;
  const [selectedProvider, setSelectedProvider] = useState(settings?.llm?.default || availableProviders[0]?.id || '');

  useEffect(() => {
    setItems(report.items || []);
    setNextItems(report.nextItems || []);
    setMarkdown(report.markdown || '');
    setMdMode(isLongType(report.type));
  }, [report.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekRecords = useMemo(() => workRecords.filter(r => r.date >= report.weekStart && r.date <= report.weekEnd), [workRecords, report.weekStart, report.weekEnd]);
  const hoursByProject = useMemo(() => {
    const map = {};
    weekRecords.forEach(r => { map[r.project] = (map[r.project] || 0) + r.hours; });
    return map;
  }, [weekRecords]);
  const totalWeekHours = useMemo(() => weekRecords.reduce((s, r) => s + r.hours, 0), [weekRecords]);

  const handleSave = () => {
    const md = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject);
    const parsed = mdMode ? parseMarkdownToReport(markdown) : { items, nextItems };
    const ver = { id: uid(), savedAt: new Date().toISOString(), label: '手动保存', markdown: md, items: parsed.items, nextItems: parsed.nextItems };
    const versions = [...(report.versions || []), ver].slice(-20);
    // 风格画像：用户改过 AI 稿时后台提炼写作规则（同一份修改稿只提炼一次，失败静默）
    const shouldDistill = !!(report.aiGenerated && md !== report.aiGenerated && md !== report.styleDistilledMd);
    onSave({ ...report, ...parsed, markdown: md, versions, styleDistilledMd: shouldDistill ? md : report.styleDistilledMd, updatedAt: new Date().toISOString() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    if (shouldDistill) {
      const settingsCopy = { ...settings, llm: { ...settings.llm, default: selectedProvider } };
      distillStyleRules(settingsCopy, report.aiGenerated, md, settings?.styleRules || [])
        .then(rules => setSettings(prev => ({ ...prev, styleRules: rules })))
        .catch(() => {});
    }
  };

  const handleCopy = () => {
    const md = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject);
    navigator.clipboard.writeText(md);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAiGen = async (providerOverride) => {
    setAiError('');
    setAiLoading(true);
    try {
      const styleRules = settings?.styleRules || [];
      let prompt;

      if (isLong) {
        // 长周期报告：分层汇总——优先以期间内下一级已审校的报告为输入（季报吃月报、年报吃季报/月报）
        const { tierLabel, reports: childReports } = pickChildReports(weeklyReports, report.type, report.weekStart, report.weekEnd);
        const periodMilestones = (settings?.milestones || []).filter(m => m.date >= report.weekStart && m.date <= report.weekEnd);
        prompt = buildLongReportPrompt({
          type: report.type,
          label: report.range,
          childReports,
          childTierLabel: tierLabel,
          records: weekRecords,
          milestones: periodMilestones,
          profiles: settings?.projectProfiles || {},
          statuses: settings?.projectStatuses || {},
          styleRules,
        });
      } else {
        const pastReports = weeklyReports
          .filter(r => r.id !== report.id && (r.type || 'weekly') === 'weekly' && r.markdown)
          .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

        const styleExamples = pastReports.slice(0, 2);
        const lastReport = pastReports[0];

        prompt = `你是工作周报助手。请根据本周工作记录生成一份专业的中文工作周报。\n\n`;

        if (styleExamples.length > 0) {
          prompt += `【公司周报风格参考 - 请严格模仿以下示例的措辞和表述习惯】\n`;
          styleExamples.forEach((r, i) => {
            prompt += `\n=== 示例${i + 1}（${r.range}周）===\n${r.markdown}\n`;
          });
          prompt += `\n`;
        }

        // 风格画像已沉淀为规则时注入规则（见 qualityBlock）；冷启动无规则时退回注入最近的修正对比原文
        if (!styleRules.length) {
          const corrections = pastReports
            .filter(r => r.aiGenerated && r.aiGenerated !== r.markdown)
            .slice(0, 3);
          if (corrections.length > 0) {
            prompt += `【历史修正记录 - 以下是AI生成后用户修改的内容，请学习用户偏好避免重犯】\n`;
            corrections.forEach((r, i) => {
              prompt += `\n修正${i + 1}（${r.range}周）：\nAI生成：\n${r.aiGenerated}\n用户修改为：\n${r.markdown}\n`;
            });
            prompt += `\n`;
          }
        }

        if (lastReport) {
          prompt += `【上周项目状态参考 - 帮助你理解各项目当前所处阶段】\n`;
          (lastReport.items || []).forEach(it => {
            prompt += `- 项目「${it.project}」上周状态：${it.progress}，内容：${it.content}\n`;
          });
          prompt += `\n`;
        }

        const dailyLines = weekRecords
          .slice().sort((a, b) => a.date.localeCompare(b.date) || a.project.localeCompare(b.project))
          .map(r => `- ${r.date} 项目「${r.project}」：${r.content}${r.outcome ? `（成果：${r.outcome}）` : ''}（${r.hours}h）`)
          .join('\n');
        prompt += `【本周每日工作明细（主要输入，请以此为准整理周报）】\n`;
        prompt += dailyLines || '（本周无工作记录）';
        prompt += `\n\n`;

        if (items.length > 0) {
          prompt += `【当前周报草稿（供参考）】\n`;
          prompt += items.map(it => `- 项目「${it.project}」：${it.content}，进度：${it.progress}`).join('\n');
          prompt += `\n\n`;
        }

        const aiHoursByProject = {};
        weekRecords.forEach(r => { aiHoursByProject[r.project] = (aiHoursByProject[r.project] || 0) + r.hours; });
        const hoursLines = Object.entries(aiHoursByProject).map(([p, h]) => `- 项目「${p}」：${h}h`).join('\n');
        if (hoursLines) prompt += `【本周各项目工时汇总】\n${hoursLines}\n\n`;

        // 汇总页人工维护的项目进度：优先级最高，AI 必须原样采用；未维护的项目才由 AI 根据工作内容判断
        const maintained = settings?.projectStatuses || {};
        const weekProjects = [...new Set(weekRecords.map(r => r.project))];
        const statusLines = weekProjects.filter(p => maintained[p]).map(p => `- 项目「${p}」：${maintained[p]}`).join('\n');
        if (statusLines) prompt += `【项目进度（人工维护，必须原样填入"项目进度"列，不要改写）】\n${statusLines}\n\n`;

        prompt += qualityBlock(styleRules);

        prompt += `
要求：
1. 开头加上：您好：\n\n本周(${report.range})的工作总结具体如下，请查收。
2. 生成"本周工作内容"表格，列：项目 | 工时 | 工作内容 | 项目进度 | 备注（工时填写实际工时，如"9h"）
3. "项目进度"列：上方【项目进度（人工维护）】中给出的项目必须原样使用给定值；未给出的项目根据本周工作内容判断（如：需求中/开发中/测试中/已上线/已完成）
4. 生成"下周工作计划"表格，列：项目 | 工作内容（根据本周进展合理推测，用户会自行修改）
5. 只输出Markdown内容，不要其他说明`;
      }

      const settingsCopy = { ...settings, llm: { ...settings.llm, default: providerOverride || selectedProvider } };

      const preMd = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject);
      const preParsed = mdMode ? parseMarkdownToReport(markdown) : { items, nextItems };
      let baseVersions = report.versions || [];
      if (preMd || preParsed.items.length > 0) {
        const ver = { id: uid(), savedAt: new Date().toISOString(), label: 'AI生成前', markdown: preMd, items: preParsed.items, nextItems: preParsed.nextItems };
        baseVersions = [...baseVersions, ver].slice(-20);
        onSave({ ...report, autoAI: false, ...preParsed, markdown: preMd, versions: baseVersions, updatedAt: new Date().toISOString() });
      }

      const result = await callAI(settingsCopy, prompt);

      // 保存 AI 原始输出，用于后续修正对比（同时带上快照内容，避免 ...report 过期 prop 冲掉第一次保存的编辑内容）
      onSave({ ...report, ...preParsed, markdown: preMd, autoAI: false, aiGenerated: result, versions: baseVersions, updatedAt: new Date().toISOString() });

      setMarkdown(result);
      const parsed = parseMarkdownToReport(result);
      if (parsed.items.length) setItems(parsed.items);
      if (parsed.nextItems.length) setNextItems(parsed.nextItems);
      setMdMode(true);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // AI 精修：对当前内容做一轮审稿（删套话、改具体），精修前自动快照
  const handleRefine = async () => {
    const cur = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject);
    if (!cur.trim()) { setAiError('当前没有可精修的内容'); return; }
    setAiError('');
    setRefining(true);
    try {
      const preParsed = mdMode ? parseMarkdownToReport(markdown) : { items, nextItems };
      const ver = { id: uid(), savedAt: new Date().toISOString(), label: '精修前', markdown: cur, items: preParsed.items, nextItems: preParsed.nextItems };
      const baseVersions = [...(report.versions || []), ver].slice(-20);
      onSave({ ...report, ...preParsed, markdown: cur, versions: baseVersions, updatedAt: new Date().toISOString() });

      const settingsCopy = { ...settings, llm: { ...settings.llm, default: selectedProvider } };
      const result = await refineReport(settingsCopy, cur, settings?.styleRules || []);

      setMarkdown(result);
      if (!isLong) {
        const parsed = parseMarkdownToReport(result);
        if (parsed.items.length) setItems(parsed.items);
        if (parsed.nextItems.length) setNextItems(parsed.nextItems);
      }
      setMdMode(true);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setRefining(false);
    }
  };

  const addItem = () => setItems([...items, { id: uid(), project: '', content: '', progress: '开发中', note: '' }]);
  const removeItem = (id) => setItems(items.filter(i => i.id !== id));
  const updateItem = (id, field, val) => setItems(items.map(i => i.id === id ? {...i, [field]: val} : i));

  const addNextItem = () => setNextItems([...nextItems, { id: uid(), project: '', content: '' }]);
  const removeNextItem = (id) => setNextItems(nextItems.filter(i => i.id !== id));
  const updateNextItem = (id, field, val) => setNextItems(nextItems.map(i => i.id === id ? {...i, [field]: val} : i));

  const handleHoursChange = (project, newTotal) => {
    if (!setWorkRecords) return;
    const projRecs = weekRecords.filter(r => r.project === project);
    const existing = projRecs.find(r => r.date === report.weekEnd);
    // 差额落到目标记录上：除该目标记录外的其余记录（含周末同项目其他记录）都计入 otherHours，
    // 保证调整后该项目本周合计精确等于 newTotal
    const otherHours = projRecs.filter(r => r.id !== (existing && existing.id)).reduce((s, r) => s + r.hours, 0);
    const lastDayHours = Math.max(0, Math.round((newTotal - otherHours) * 10) / 10);
    if (existing) {
      setWorkRecords(workRecords.map(r => r.id === existing.id ? { ...r, hours: lastDayHours } : r));
    } else {
      setWorkRecords([...workRecords, { id: uid(), date: report.weekEnd, project, content: project, hours: lastDayHours, createdAt: new Date().toISOString() }]);
    }
  };

  useEffect(() => {
    if (report.autoAI) {
      onSave({ ...report, autoAI: false, updatedAt: new Date().toISOString() });
      handleAiGen(report.autoAIProvider || undefined);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* 工具栏 */}
      <div className="border-b border-gray-100">
        {/* 行1：标题 + 保存 */}
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <div>
            <h3 className="font-semibold text-gray-800">{isLong ? `${report.range} ${LONG_TYPES[report.type]?.name || ''}` : `第 ${report.range} 周`}</h3>
            <span className="text-xs text-gray-400">{report.weekStart} ～ {report.weekEnd}</span>
          </div>
          <div className="flex items-center gap-2">
            {(report.versions || []).length > 0 && (
              <button onClick={() => setShowVersions(true)} className="px-3 py-1.5 text-xs rounded-lg font-medium border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition-colors">
                历史 ({(report.versions || []).length})
              </button>
            )}
            <button onClick={handleSave} className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
              {saved ? '已保存 ✓' : '保存'}
            </button>
          </div>
        </div>
        {/* 行2：AI + 模式切换 */}
        <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 h-8">
            <select
              className="text-xs text-gray-600 bg-transparent outline-none h-full"
              value={selectedProvider}
              onChange={e => setSelectedProvider(e.target.value)}
            >
              {availableProviders.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <span className="text-gray-300 mx-1 select-none">|</span>
            <button
              onClick={() => handleAiGen()}
              disabled={aiLoading || refining}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {aiLoading ? '生成中...' : 'AI 重新生成'}
            </button>
            <span className="text-gray-300 mx-1 select-none">|</span>
            <button
              onClick={handleRefine}
              disabled={aiLoading || refining}
              title="AI 逐行审稿：删除套话、把模糊表述改具体，不改事实"
              className="text-xs text-indigo-600 hover:text-indigo-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {refining ? '精修中...' : 'AI 精修'}
            </button>
          </div>
          {!isLong && (
            <div className="flex bg-gray-50 border border-gray-200 rounded-lg overflow-hidden text-xs h-8">
              <button onClick={() => { setMdMode(false); setMdPreview(false); }} className={`px-3 h-full transition-colors ${!mdMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>结构化</button>
              <button onClick={() => { if (!mdMode) setMarkdown(buildMarkdown({ ...report, items, nextItems }, hoursByProject)); setMdMode(true); }} className={`px-3 h-full transition-colors ${mdMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Markdown</button>
            </div>
          )}
        </div>
      </div>

      {/* Markdown 操作区 */}
      {mdMode && (
        <div className="flex items-center justify-between px-5 py-2 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">Markdown</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMdPreview(v => !v)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${mdPreview ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}`}
            >
              {mdPreview ? '编辑源码' : '预览'}
            </button>
            <button
              onClick={handleCopy}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${copied ? 'bg-green-50 border-green-200 text-green-600' : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}`}
            >
              {copied ? '已复制 ✓' : '复制'}
            </button>
          </div>
        </div>
      )}

      {aiError && (
        <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg">{aiError}</div>
      )}

      <div className="flex-1 overflow-y-auto p-5 space-y-6 scrollbar-thin">
        {mdMode ? (
          mdPreview ? (
            <div
              className="md-preview w-full border border-gray-200 rounded-lg p-5 bg-white"
              style={{minHeight:'500px'}}
              dangerouslySetInnerHTML={{__html: renderMarkdown(markdown)}}
            />
          ) : (
            <textarea
              className="w-full border border-gray-200 rounded-lg p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300"
              style={{minHeight:'500px'}}
              value={markdown}
              onChange={e => { setMarkdown(e.target.value); const p = parseMarkdownToReport(e.target.value); if(p.items.length) setItems(p.items); if(p.nextItems.length) setNextItems(p.nextItems); }}
            />
          )
        ) : (
          <>
            {/* 本周工作内容 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-700 text-sm">本周工作内容</h4>
                <button onClick={addItem} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <span>+</span> 添加行
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 px-3 py-2" style={{gridTemplateColumns:'1fr 2fr 60px 1fr 1fr auto'}}>
                  <span>项目</span><span>工作内容</span><span>本周工时</span><span>项目进度</span><span>备注</span><span></span>
                </div>
                {totalWeekHours > 0 && (
                  <div className="grid items-center px-3 py-2 gap-2 bg-blue-50 border-b border-blue-100 text-xs font-medium text-blue-700" style={{gridTemplateColumns:'1fr 2fr 60px 1fr 1fr auto'}}>
                    <span>本周合计</span><span></span><span className="font-bold">{totalWeekHours}h</span><span></span><span></span><span></span>
                  </div>
                )}
                {items.map((it, idx) => (
                  <div key={it.id} className={`grid items-center px-3 py-2 gap-2 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`} style={{gridTemplateColumns:'1fr 2fr 60px 1fr 1fr auto'}}>
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.project} onChange={e => updateItem(it.id, 'project', e.target.value)} placeholder="项目名" />
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.content} onChange={e => updateItem(it.id, 'content', e.target.value)} placeholder="工作内容" />
                    <input
                      type="number" min="0" step="0.5"
                      className="w-full border border-blue-200 rounded px-1 py-1 text-xs text-blue-700 font-medium text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50"
                      value={hoursByProject[it.project] ?? ''}
                      placeholder="0"
                      onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) handleHoursChange(it.project, v); }}
                    />
                    <EditableSelect
                      value={it.progress || '开发中'}
                      options={settings.progressOptions || DEFAULT_PROGRESS_OPTIONS}
                      onChange={v => {
                        updateItem(it.id, 'progress', v);
                        // 与汇总页的项目进度双向同步：这里改了，汇总页与后续生成的报告一并生效
                        if (it.project) setSettings(prev => ({ ...prev, projectStatuses: { ...(prev.projectStatuses || {}), [it.project]: v } }));
                      }}
                      onAddOption={v => setSettings(prev => ({ ...prev, progressOptions: [...(prev.progressOptions || DEFAULT_PROGRESS_OPTIONS), v] }))}
                    />
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.note||''} onChange={e => updateItem(it.id, 'note', e.target.value)} placeholder="备注" />
                    <button onClick={() => removeItem(it.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">&times;</button>
                  </div>
                ))}
                {items.length === 0 && <div className="text-center text-gray-300 text-sm py-4">暂无数据</div>}
              </div>
            </div>

            {/* 下周工作计划 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-700 text-sm">下周工作计划</h4>
                <button onClick={addNextItem} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <span>+</span> 添加行
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 px-3 py-2" style={{gridTemplateColumns:'1fr 2fr auto'}}>
                  <span>项目</span><span>工作内容</span><span></span>
                </div>
                {nextItems.map((it, idx) => (
                  <div key={it.id} className={`grid items-center px-3 py-2 gap-2 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`} style={{gridTemplateColumns:'1fr 2fr auto'}}>
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.project} onChange={e => updateNextItem(it.id, 'project', e.target.value)} placeholder="项目名" />
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.content} onChange={e => updateNextItem(it.id, 'content', e.target.value)} placeholder="下周计划" />
                    <button onClick={() => removeNextItem(it.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">&times;</button>
                  </div>
                ))}
                {nextItems.length === 0 && <div className="text-center text-gray-300 text-sm py-4">暂无数据</div>}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 历史版本面板 */}
      {showVersions && (
        <div className="fixed inset-0 z-50 flex" style={{top:0,left:0}}>
          <div className="flex-1 bg-black/20" onClick={() => { setShowVersions(false); setPreviewVersion(null); }} />
          <div className="w-80 bg-white shadow-2xl flex flex-col border-l border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
              <span className="font-semibold text-sm text-gray-800">历史版本</span>
              <button onClick={() => { setShowVersions(false); setPreviewVersion(null); }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">&times;</button>
            </div>
            {previewVersion ? (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-white">
                  <button onClick={() => setPreviewVersion(null)} className="text-xs text-gray-500 hover:text-gray-700">← 返回列表</button>
                  <span className="text-xs text-gray-400 flex-1 truncate">{previewVersion.label} · {new Date(previewVersion.savedAt).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                  <button
                    onClick={() => {
                      setItems(previewVersion.items || []);
                      setNextItems(previewVersion.nextItems || []);
                      setMarkdown(previewVersion.markdown || '');
                      setMdMode(isLong);
                      setShowVersions(false);
                      setPreviewVersion(null);
                    }}
                    className="shrink-0 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  >恢复此版本</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{previewVersion.markdown || (previewVersion.items || []).map(it => `• ${it.project}：${it.content}`).join('\n') || '（无内容）'}</pre>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                {[...(report.versions || [])].reverse().map((v) => (
                  <div key={v.id} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer" onClick={() => setPreviewVersion(v)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${v.label === 'AI生成前' ? 'bg-orange-50 text-orange-600' : 'bg-blue-50 text-blue-600'}`}>{v.label}</span>
                      <span className="text-xs text-gray-400 shrink-0">{new Date(v.savedAt).toLocaleString('zh-CN', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-400 truncate">{v.markdown ? v.markdown.slice(0, 60) : (v.items || []).map(it => it.project).join('、') || '（空）'}</div>
                  </div>
                ))}
                {(report.versions || []).length === 0 && <div className="text-center text-gray-300 text-sm py-8">暂无历史版本</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
