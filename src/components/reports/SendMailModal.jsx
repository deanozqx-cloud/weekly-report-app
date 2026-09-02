import { useState, useMemo } from 'react';
import { renderMarkdown } from '../../lib/markdown';
import { sbSendMail } from '../../lib/supabase';
import { fillSubject, DEFAULT_SUBJECT_TEMPLATE, mergeContacts, splitAddresses, isEmail } from '../../lib/mail';
import Modal from '../ui/Modal';
import RecipientInput from '../ui/RecipientInput';

export default function SendMailModal({ report, markdown, settings, setSettings, onClose }) {
  const saved = settings?.mail || {};
  const [to, setTo] = useState(saved.to || '');
  const [cc, setCc] = useState(saved.cc || '');
  const [senderName, setSenderName] = useState(saved.senderName || '');
  const [template, setTemplate] = useState(saved.subjectTemplate || DEFAULT_SUBJECT_TEMPLATE);
  const [subject, setSubject] = useState(() => fillSubject(saved.subjectTemplate || DEFAULT_SUBJECT_TEMPLATE, report, saved.senderName));
  const [subjectTouched, setSubjectTouched] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  // 通讯录建立之前发过的邮件没有留下记录，用上次的收件人/抄送补上，
  // 这样老用户一打开就有候选，而不是等下一次发送才开始积累
  const contacts = useMemo(() => {
    const stored = saved.contacts || [];
    const known = new Set(stored.map(c => c.email));
    const legacy = [...splitAddresses(saved.to), ...splitAddresses(saved.cc)]
      .map(s => s.toLowerCase())
      .filter(e => isEmail(e) && !known.has(e));
    return legacy.length ? mergeContacts(stored, legacy) : stored;
  }, [saved.contacts, saved.to, saved.cc]);

  const html = renderMarkdown(markdown, { inline: true });

  // 模板或姓名变化时刷新主题（除非用户已手动改过主题）
  const syncSubject = (tpl, name) => {
    if (!subjectTouched) setSubject(fillSubject(tpl, report, name));
  };

  // 发送成功后才记：没发出去的地址不进通讯录
  const persist = () => {
    const used = [...splitAddresses(to), ...splitAddresses(cc)];
    setSettings(prev => ({
      ...prev,
      mail: {
        ...(prev.mail || {}),
        to, cc, senderName, subjectTemplate: template,
        contacts: mergeContacts(prev.mail?.contacts, used),
      },
    }));
  };

  const handleSend = async () => {
    if (!to.trim()) { setError('请填写收件人'); return; }
    if (!subject.trim()) { setError('请填写主题'); return; }
    setError('');
    setStatus('sending');
    try {
      await sbSendMail({ to, cc, subject, html, text: markdown });
      persist();
      setStatus('sent');
      setTimeout(onClose, 1500);
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  };

  return (
    <Modal title="发送周报邮件" onClose={onClose} width="max-w-3xl">
      <div className="space-y-4">
        {/* 收件人 */}
        <div className="grid grid-cols-1 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">收件人 <span className="text-red-400">*</span> <span className="text-gray-400 font-normal">(多个用逗号分隔)</span></label>
            <RecipientInput
              value={to}
              onChange={setTo}
              contacts={contacts}
              placeholder="leader@company.com, hr@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">抄送 <span className="text-gray-400 font-normal">(可选)</span></label>
            <RecipientInput
              value={cc}
              onChange={setCc}
              contacts={contacts}
              placeholder="colleague@company.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">主题</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={subject}
              onChange={e => { setSubject(e.target.value); setSubjectTouched(true); }}
            />
          </div>
        </div>

        {/* 高级：姓名与主题模板 */}
        <div>
          <button onClick={() => setShowAdvanced(v => !v)} className="text-xs text-gray-500 hover:text-gray-700">
            {showAdvanced ? '收起' : '主题模板设置'} {showAdvanced ? '▴' : '▾'}
          </button>
          {showAdvanced && (
            <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-3 bg-gray-50 rounded-lg p-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">你的姓名</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder="用于主题中的 {姓名}"
                  value={senderName}
                  onChange={e => { setSenderName(e.target.value); syncSubject(template, e.target.value); }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">主题模板</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
                  value={template}
                  onChange={e => { setTemplate(e.target.value); syncSubject(e.target.value, senderName); }}
                />
                <p className="text-xs text-gray-400 mt-1">可用：{'{类型} {周期} {姓名} {开始} {结束} {年}'}</p>
              </div>
            </div>
          )}
        </div>

        {/* 正文预览：与实际发出的 HTML 完全一致 */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-500">正文预览</label>
            <span className="text-xs text-gray-400">下方即收件人看到的样子</span>
          </div>
          <div
            className="border border-gray-200 rounded-lg p-4 bg-white overflow-auto"
            style={{ maxHeight: '360px' }}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg whitespace-pre-wrap">{error}</div>
        )}
        {status === 'sent' && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded-lg">✓ 已发送</div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-gray-400">通过服务端 SMTP 发出，凭据不在浏览器中</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
            <button
              onClick={handleSend}
              disabled={status !== 'idle'}
              className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === 'sending' ? '发送中…' : status === 'sent' ? '已发送 ✓' : '确认发送'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
