import { useState, useEffect, useMemo } from 'react';
import { DEFAULT_PROVIDERS, DEFAULT_PROGRESS_OPTIONS, PRIORITY_OPTIONS } from '../../lib/constants';
import { uid } from '../../lib/utils';
import { callAI, distillStyleRules, refineReport } from '../../lib/ai';
import { buildLongReportPrompt, buildWeeklyReportPrompt, pickChildReports, isLongType, LONG_TYPES } from '../../lib/prompts';
import { buildMarkdown, parseMarkdownToReport, renderMarkdown, proseSections, docBlockOrder, HOURS_PER_DAY } from '../../lib/markdown';
import { copyRichText, copyPlainText } from '../../lib/clipboard';
import SendMailModal from './SendMailModal';
import EditableSelect from '../ui/EditableSelect';

export default function ReportEditor({ report, onSave, settings, setSettings, weeklyReports = [], workRecords = [], setWorkRecords }) {
  // 长周期报告（月报/季报/半年报/年报）：只用 Markdown 模式编辑（结构化表格是周报专属）
  const isLong = isLongType(report.type);
  const [items, setItems] = useState(report.items || []);
  const [nextItems, setNextItems] = useState(report.nextItems || []);
  const [markdown, setMarkdown] = useState(report.markdown || '');
  // 两张表之外的叙述小节，结构化模式下渲染成可编辑文本框
  const [prose, setProse] = useState(() => proseSections(report.markdown || ''));
  // 小节顺序（含两张表），结构化模式据此排版，与最终输出顺序一致
  const [blockOrder, setBlockOrder] = useState(() => docBlockOrder(report.markdown || ''));
  const [mdMode, setMdMode] = useState(isLong);
  const [mdPreview, setMdPreview] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [refining, setRefining] = useState(false);
  const [aiError, setAiError] = useState('');
  const [copied, setCopied] = useState(''); // '' | 'rich' | 'md'
  const [saved, setSaved] = useState(false);
  const [showMail, setShowMail] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(null);
  const availableProviders = settings?.llm?.providers || DEFAULT_PROVIDERS;
  const [selectedProvider, setSelectedProvider] = useState(settings?.llm?.default || availableProviders[0]?.id || '');

  // 状态重置依赖父组件的 key={id:generatedAt} 强制重挂载：切换报告或覆盖重新生成时
  // 整个编辑器重建，useState 初始值即为最新报告内容，无需 effect 同步

  const weekRecords = useMemo(() => workRecords.filter(r => r.date >= report.weekStart && r.date <= report.weekEnd), [workRecords, report.weekStart, report.weekEnd]);
  const hoursByProject = useMemo(() => {
    const map = {};
    weekRecords.forEach(r => { map[r.project] = (map[r.project] || 0) + r.hours; });
    return map;
  }, [weekRecords]);
  // 合计四舍五入到两位，避免 0.1+0.2 类浮点误差直接展示
  const totalWeekHours = useMemo(() => Math.round(weekRecords.reduce((s, r) => s + r.hours, 0) * 100) / 100, [weekRecords]);
  // 合计忠于表格：只统计表内出现的项目（去重）。AI 生成的行可能合并/漏掉某些项目，
  // 若直接用全部记录总工时，会出现「合计 ≠ 各行之和」的累加观感；表外记录单独提示
  const tableHours = useMemo(() => {
    const projects = [...new Set(items.map(it => it.project).filter(Boolean))];
    return Math.round(projects.reduce((s, p) => s + (hoursByProject[p] || 0), 0) * 100) / 100;
  }, [items, hoursByProject]);
  const hiddenHours = Math.round((totalWeekHours - tableHours) * 100) / 100;
  // 工时列编辑草稿：输入框受控于 hoursByProject 实时计算值，直接受控会导致清空立刻回弹无法输入过程态
  const [hoursDraft, setHoursDraft] = useState({});

  // 周报板块/列开关。长周期报告有自己的结构，不受这些开关影响
  const reportSections = useMemo(
    () => (isLongType(report.type) ? {} : (settings?.reportSections || {})),
    [report.type, settings?.reportSections],
  );

  const proseMap = useMemo(
    () => Object.fromEntries(prose.map(p => [p.heading, p.body])),
    [prose],
  );
  const updateProse = (heading, body) => setProse(ps => ps.map(p => p.heading === heading ? { ...p, body } : p));

  // 本周工作内容表的网格列宽：人天/占比为只读派生列，随开关增减
  const itemGridCols = useMemo(() => [
    '1fr', '2fr', '60px',
    ...(reportSections.days ? ['52px'] : []),
    ...(reportSections.share ? ['52px'] : []),
    '1fr', '1fr', 'auto',
  ].join(' '), [reportSections.days, reportSections.share]);

  // 下周计划表的网格列宽随开关增减，表头与数据行共用一份定义避免错位
  const nextGridCols = useMemo(() => [
    '1fr', '2fr',
    ...(reportSections.priority ? ['80px'] : []),
    ...(reportSections.deliverable ? ['1.5fr'] : []),
    'auto',
  ].join(' '), [reportSections.priority, reportSections.deliverable]);

  const handleSave = () => {
    const md = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject, reportSections, proseMap);
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

  const currentMarkdown = () => (mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject, reportSections, proseMap));

  // 富文本复制：粘进企业微信/邮件/Word 时保留表格与排版
  const handleCopyRich = async () => {
    const md = currentMarkdown();
    const ok = await copyRichText(renderMarkdown(md, { inline: true }), md);
    if (!ok) { setAiError('复制失败，请改用「复制源码」后手动粘贴'); return; }
    setCopied('rich');
    setTimeout(() => setCopied(''), 2000);
  };

  // 源码复制：粘到支持 Markdown 的地方（飞书文档、语雀、GitHub 等）
  const handleCopyMd = async () => {
    const ok = await copyPlainText(currentMarkdown());
    if (!ok) { setAiError('复制失败，请手动选中内容复制'); return; }
    setCopied('md');
    setTimeout(() => setCopied(''), 2000);
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
        // 范文仅半年报/年报开放，配置了才生效
        const template = (report.type === 'half' || report.type === 'annual') ? settings?.reportTemplates?.[report.type] : null;
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
          template,
          extraMaterial: report.extraMaterial || '',
        });
      } else {
        const pastReports = weeklyReports
          .filter(r => r.id !== report.id && (r.type || 'weekly') === 'weekly' && r.markdown)
          .sort((a, b) => b.weekStart.localeCompare(a.weekStart));

        const aiHoursByProject = {};
        weekRecords.forEach(r => { aiHoursByProject[r.project] = (aiHoursByProject[r.project] || 0) + r.hours; });

        // 领导要看的是项目全景：汇总页维护过进度或档案的项目，加上本周有记录的，
        // 本周没动的项目也要出现在报告里
        const statuses = settings?.projectStatuses || {};
        const profiles = settings?.projectProfiles || {};
        const activeProjects = new Set(weekRecords.map(r => r.project).filter(Boolean));
        const allProjects = [...new Set([...Object.keys(statuses), ...Object.keys(profiles), ...activeProjects])]
          .filter(Boolean)
          .map(name => ({ name, progress: statuses[name] || '', active: activeProjects.has(name) }))
          // 本周有投入的排前面，便于 AI 判断轻重
          .sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name));
        const weekMilestones = (settings?.milestones || [])
          .filter(m => m.date >= report.weekStart && m.date <= report.weekEnd)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)));

        prompt = buildWeeklyReportPrompt({
          range: report.range,
          pastReports,
          styleRules,
          weekRecords,
          items,
          hoursByProject: aiHoursByProject,
          maintainedStatuses: statuses,
          sections: reportSections,
          allProjects,
          milestones: weekMilestones,
          profiles,
          // 范文配置了才生效；未配置时退回用历史周报传递公司写法
          template: settings?.reportTemplates?.weekly,
          extraMaterial: report.extraMaterial || '',
        });
      }

      const settingsCopy = { ...settings, llm: { ...settings.llm, default: providerOverride || selectedProvider } };

      const preMd = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject, reportSections, proseMap);
      const preParsed = mdMode ? parseMarkdownToReport(markdown) : { items, nextItems };
      let baseVersions = report.versions || [];
      if (preMd || preParsed.items.length > 0) {
        const ver = { id: uid(), savedAt: new Date().toISOString(), label: 'AI生成前', markdown: preMd, items: preParsed.items, nextItems: preParsed.nextItems };
        baseVersions = [...baseVersions, ver].slice(-20);
        onSave({ ...report, autoAI: false, ...preParsed, markdown: preMd, versions: baseVersions, updatedAt: new Date().toISOString() });
      }

      // 半年报/年报是长文本，输出窗口放大到 8192 避免截断
      const result = await callAI(settingsCopy, prompt, { maxTokens: (report.type === 'half' || report.type === 'annual') ? 8192 : 4096 });

      // AI 结果立即落库（不落库的话切换报告/关页面就丢了，而同步指示灯却显示"已同步"）；
      // 生成前的内容已在上方存为「AI生成前」版本快照，可随时恢复
      const parsed = parseMarkdownToReport(result);
      onSave({
        ...report,
        items: isLong ? (report.items || []) : parsed.items,
        nextItems: isLong ? (report.nextItems || []) : parsed.nextItems,
        markdown: result,
        autoAI: false, aiGenerated: result, versions: baseVersions,
        updatedAt: new Date().toISOString(),
      });

      setMarkdown(result);
      setProse(proseSections(result)); setBlockOrder(docBlockOrder(result));
      if (!isLong) { setItems(parsed.items); setNextItems(parsed.nextItems); }
      setMdMode(true);
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiLoading(false);
    }
  };

  // AI 精修：对当前内容做一轮审稿（删套话、改具体），精修前自动快照
  const handleRefine = async () => {
    const cur = mdMode ? markdown : buildMarkdown({ ...report, items, nextItems }, hoursByProject, reportSections, proseMap);
    if (!cur.trim()) { setAiError('当前没有可精修的内容'); return; }
    setAiError('');
    setRefining(true);
    try {
      const preParsed = mdMode ? parseMarkdownToReport(markdown) : { items, nextItems };
      const ver = { id: uid(), savedAt: new Date().toISOString(), label: '精修前', markdown: cur, items: preParsed.items, nextItems: preParsed.nextItems };
      const baseVersions = [...(report.versions || []), ver].slice(-20);
      onSave({ ...report, ...preParsed, markdown: cur, versions: baseVersions, updatedAt: new Date().toISOString() });

      const settingsCopy = { ...settings, llm: { ...settings.llm, default: selectedProvider } };
      const result = await refineReport(settingsCopy, cur, settings?.styleRules || [], (report.type === 'half' || report.type === 'annual') ? 8192 : 4096);

      // 精修结果同样立即落库（精修前内容已存为「精修前」版本快照）
      const parsedR = parseMarkdownToReport(result);
      onSave({
        ...report,
        items: isLong ? (report.items || []) : parsedR.items,
        nextItems: isLong ? (report.nextItems || []) : parsedR.nextItems,
        markdown: result,
        versions: baseVersions,
        updatedAt: new Date().toISOString(),
      });

      setMarkdown(result);
      setProse(proseSections(result)); setBlockOrder(docBlockOrder(result));
      if (!isLong) { setItems(parsedR.items); setNextItems(parsedR.nextItems); }
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

  const addNextItem = () => setNextItems([...nextItems, { id: uid(), project: '', content: '', priority: '', deliverable: '' }]);
  const removeNextItem = (id) => setNextItems(nextItems.filter(i => i.id !== id));
  const updateNextItem = (id, field, val) => setNextItems(nextItems.map(i => i.id === id ? {...i, [field]: val} : i));

  const handleHoursChange = (project, newTotal) => {
    if (!setWorkRecords) return;
    const projRecs = weekRecords.filter(r => r.project === project);
    const existing = projRecs.find(r => r.date === report.weekEnd);
    // 差额落到目标记录上：除该目标记录外的其余记录（含周末同项目其他记录）都计入 otherHours，
    // 保证调整后该项目本周合计精确等于 newTotal
    const otherHours = projRecs.filter(r => r.id !== (existing && existing.id)).reduce((s, r) => s + r.hours, 0);
    if (newTotal < otherHours) {
      // 调整只作用于周期最后一天的记录，无法把合计压到其他日期已有记录之下——说明下限而不是静默钳位
      alert(`「${project}」在本周其他日期已有 ${Math.round(otherHours * 100) / 100}h 记录，此处最低只能调到 ${Math.round(otherHours * 100) / 100}h。\n如需更低，请到工作台修改对应日期的记录。`);
    }
    const lastDayHours = Math.max(0, Math.round((newTotal - otherHours) * 10) / 10);
    if (existing) {
      setWorkRecords(prev => prev.map(r => r.id === existing.id ? { ...r, hours: lastDayHours } : r));
    } else {
      setWorkRecords(prev => [...prev, { id: uid(), date: report.weekEnd, project, content: '工时调整', hours: lastDayHours, createdAt: new Date().toISOString() }]);
    }
  };

  // 两张表的 JSX 提为变量，按 blockOrder 插到正确位置
  const itemsBlock = (
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
                <div className="grid bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 px-3 py-2" style={{gridTemplateColumns:itemGridCols}}>
                  <span>项目</span><span>工作内容</span><span>本周工时</span>
                  {reportSections.days && <span>人天</span>}
                  {reportSections.share && <span>占比</span>}
                  <span>项目进度</span><span>备注</span><span></span>
                </div>
                {(totalWeekHours > 0 || tableHours > 0) && (
                  <div className="grid items-center px-3 py-2 gap-2 bg-blue-50 border-b border-blue-100 text-xs font-medium text-blue-700" style={{gridTemplateColumns:itemGridCols}}>
                    <span>本周合计</span>
                    <span>
                      {hiddenHours > 0 && (
                        <span className="font-normal text-amber-600" title="该周期的工作记录中，有部分项目未出现在下方表格里（可能被 AI 合并或漏掉了项目行）。可添加对应项目行将其计入，或忽略此提示。">
                          ⚠ 另有 {hiddenHours}h 记录未列入表格（记录总计 {totalWeekHours}h）
                        </span>
                      )}
                    </span>
                    <span className="font-bold">{tableHours}h</span>
                    {reportSections.days && <span className="font-bold">{(tableHours / HOURS_PER_DAY).toFixed(1)}</span>}
                    {reportSections.share && <span></span>}
                    <span></span><span></span><span></span>
                  </div>
                )}
                {items.map((it, idx) => (
                  <div key={it.id} className={`grid items-center px-3 py-2 gap-2 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`} style={{gridTemplateColumns:itemGridCols}}>
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.project} onChange={e => updateItem(it.id, 'project', e.target.value)} placeholder="项目名" />
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.content} onChange={e => updateItem(it.id, 'content', e.target.value)} placeholder="工作内容" />
                    <input
                      type="number" min="0" step="0.5"
                      className="w-full border border-blue-200 rounded px-1 py-1 text-xs text-blue-700 font-medium text-center focus:outline-none focus:ring-1 focus:ring-blue-400 bg-blue-50"
                      value={hoursDraft[it.project] ?? (hoursByProject[it.project] ?? '')}
                      placeholder="0"
                      title="输入后回车或移开焦点生效"
                      onChange={e => setHoursDraft(d => ({ ...d, [it.project]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                      onBlur={e => {
                        // 失焦才提交：输入过程不写记录，避免过程值（如输入"12"时的"1"）
                        // 被当成目标工时写入；空值/非法值直接还原为计算值，不做任何修改
                        const v = parseFloat(e.target.value);
                        if (!isNaN(v) && v >= 0 && it.project) handleHoursChange(it.project, v);
                        setHoursDraft(d => { const c = { ...d }; delete c[it.project]; return c; });
                      }}
                    />
                    {reportSections.days && (
                      <span className="text-xs text-gray-400 text-center tabular-nums" title="工时 ÷ 7.5，由工时自动计算">
                        {hoursByProject[it.project] != null ? (hoursByProject[it.project] / HOURS_PER_DAY).toFixed(1) : '—'}
                      </span>
                    )}
                    {reportSections.share && (
                      <span className="text-xs text-gray-400 text-center tabular-nums" title="占本周表内总工时的比例，由工时自动计算">
                        {hoursByProject[it.project] != null && tableHours > 0
                          ? `${Math.round((hoursByProject[it.project] / tableHours) * 100)}%`
                          : '—'}
                      </span>
                    )}
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

    </>
  );
  const nextBlock = (
    <>
            {/* 下周工作计划 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-700 text-sm">下周工作计划</h4>
                <button onClick={addNextItem} className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                  <span>+</span> 添加行
                </button>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="grid bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-500 px-3 py-2" style={{gridTemplateColumns:nextGridCols}}>
                  <span>项目</span><span>工作内容</span>
                  {reportSections.priority && <span>优先级</span>}
                  {reportSections.deliverable && <span>交付物</span>}
                  <span></span>
                </div>
                {nextItems.map((it, idx) => (
                  <div key={it.id} className={`grid items-center px-3 py-2 gap-2 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`} style={{gridTemplateColumns:nextGridCols}}>
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.project} onChange={e => updateNextItem(it.id, 'project', e.target.value)} placeholder="项目名" />
                    <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.content} onChange={e => updateNextItem(it.id, 'content', e.target.value)} placeholder="下周计划" />
                    {reportSections.priority && (
                      <EditableSelect
                        value={it.priority || ''}
                        options={PRIORITY_OPTIONS}
                        onChange={v => updateNextItem(it.id, 'priority', v)}
                      />
                    )}
                    {reportSections.deliverable && (
                      <input className="border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-300" value={it.deliverable || ''} onChange={e => updateNextItem(it.id, 'deliverable', e.target.value)} placeholder="预期交付物" />
                    )}
                    <button onClick={() => removeNextItem(it.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">&times;</button>
                  </div>
                ))}
                {nextItems.length === 0 && <div className="text-center text-gray-300 text-sm py-4">暂无数据</div>}
              </div>
            </div>
    </>
  );


  // 新建报告自动触发 AI 生成：挂载时执行一次（父组件 key 保证每份新生成的报告都会重挂载）。
  // 延迟到下一拍执行，避免在 effect 中同步 setState；卸载时取消
  useEffect(() => {
    if (!report.autoAI) return;
    const timer = setTimeout(() => {
      onSave({ ...report, autoAI: false, updatedAt: new Date().toISOString() });
      handleAiGen(report.autoAIProvider || undefined);
    }, 0);
    return () => clearTimeout(timer);
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
              <button onClick={() => { if (!mdMode) setMarkdown(buildMarkdown({ ...report, items, nextItems }, hoursByProject, reportSections, proseMap)); setMdMode(true); }} className={`px-3 h-full transition-colors ${mdMode ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>Markdown</button>
            </div>
          )}
          <button
            onClick={() => setShowMail(true)}
            title="填好收件人后一键发出，发送前可预览"
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-blue-200 text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors ml-auto whitespace-nowrap"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            发邮件
          </button>
          {/* 复制：两种模式下都可用 */}
          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-2 h-8">
            <button
              onClick={handleCopyRich}
              title="带格式复制，粘贴到企业微信/邮件/Word 时保留表格"
              className={`text-xs font-medium whitespace-nowrap transition-colors ${copied === 'rich' ? 'text-green-600' : 'text-emerald-600 hover:text-emerald-700'}`}
            >
              {copied === 'rich' ? '已复制 ✓' : '复制（带格式）'}
            </button>
            <span className="text-gray-300 mx-1 select-none">|</span>
            <button
              onClick={handleCopyMd}
              title="复制 Markdown 源码，适合粘到飞书文档/语雀等支持 Markdown 的地方"
              className={`text-xs font-medium whitespace-nowrap transition-colors ${copied === 'md' ? 'text-green-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {copied === 'md' ? '已复制 ✓' : '源码'}
            </button>
          </div>
        </div>
      </div>

      {/* Markdown 操作区 */}
      {mdMode && (
        <div className="flex items-center justify-between px-5 py-2 bg-gray-50 border-b border-gray-100">
          <span className="text-xs font-semibold text-gray-400 tracking-widest uppercase">Markdown</span>
          <button
            onClick={() => setMdPreview(v => !v)}
            className={`px-3 py-1 text-xs rounded-md border transition-colors ${mdPreview ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'border-gray-200 text-gray-500 bg-white hover:border-gray-300'}`}
          >
            {mdPreview ? '编辑源码' : '预览'}
          </button>
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
              onChange={e => { setMarkdown(e.target.value); setProse(proseSections(e.target.value)); setBlockOrder(docBlockOrder(e.target.value)); const p = parseMarkdownToReport(e.target.value); setItems(p.items); setNextItems(p.nextItems); }}
            />
          )
        ) : (
          <>
            {/* 按原文小节顺序渲染：编辑器里看到的顺序即最终输出顺序 */}
            {blockOrder.map(heading => {
              if (heading === '本周工作内容') return <div key={heading}>{itemsBlock}</div>;
              if (heading === '下周工作计划') return <div key={heading}>{nextBlock}</div>;
              const sec = prose.find(p => p.heading === heading);
              if (!sec) return null;
              return (
                <div key={heading}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-700 text-sm">{sec.heading}</h4>
                    <span className="text-xs text-gray-300">清空内容即从周报中移除该板块</span>
                  </div>
                  <textarea
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-300"
                    rows={Math.min(10, Math.max(3, sec.body.split('\n').length + 1))}
                    value={sec.body}
                    onChange={e => updateProse(sec.heading, e.target.value)}
                  />
                </div>
              );
            })}
          </>
        )}
      </div>

      {showMail && (
        <SendMailModal
          report={report}
          markdown={currentMarkdown()}
          settings={settings}
          setSettings={setSettings}
          onClose={() => setShowMail(false)}
        />
      )}

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
                      setProse(proseSections(previewVersion.markdown || ''));
                      setBlockOrder(docBlockOrder(previewVersion.markdown || ''));
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
