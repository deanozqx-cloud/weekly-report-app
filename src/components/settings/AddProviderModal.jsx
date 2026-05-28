import { useState } from 'react';
import Modal from '../ui/Modal';

export default function AddProviderModal({ onAdd, onClose }) {
  const presets = [
    { label: 'DeepSeek',    model: 'deepseek-chat',            baseUrl: 'https://api.deepseek.com/v1',           apiType: 'openai' },
    { label: 'OpenAI',      model: 'gpt-4o-mini',              baseUrl: 'https://api.openai.com/v1',             apiType: 'openai' },
    { label: 'Claude',      model: 'claude-sonnet-4-20250514', baseUrl: 'https://api.anthropic.com/v1',          apiType: 'claude' },
    { label: '智谱 GLM',    model: 'glm-4-flash',              baseUrl: 'https://open.bigmodel.cn/api/paas/v4',  apiType: 'openai' },
    { label: 'Kimi',        model: 'moonshot-v1-8k',           baseUrl: 'https://api.moonshot.cn/v1',            apiType: 'openai' },
    { label: 'Ollama',      model: 'llama3',                   baseUrl: 'http://localhost:11434/v1',              apiType: 'openai' },
    { label: 'Groq',        model: 'llama-3.3-70b-versatile',  baseUrl: 'https://api.groq.com/openai/v1',        apiType: 'openai' },
    { label: '自定义',      model: '',                         baseUrl: '',                                       apiType: 'openai' },
  ];
  const [form, setForm] = useState({ label: '', model: '', baseUrl: '', apiType: 'openai' });
  const [selected, setSelected] = useState(null);

  const pickPreset = (p) => {
    setSelected(p.label);
    setForm({ label: p.label, model: p.model, baseUrl: p.baseUrl, apiType: p.apiType });
  };

  const handleAdd = () => {
    if (!form.label.trim()) { alert('请填写名称'); return; }
    onAdd(form);
  };

  return (
    <Modal title="添加 LLM 提供商" onClose={onClose} width="max-w-lg">
      <div className="space-y-5">
        {/* 预设快选 */}
        <div>
          <div className="text-xs font-medium text-gray-500 mb-2">从预设快速选择</div>
          <div className="grid grid-cols-4 gap-2">
            {presets.map(p => (
              <button
                key={p.label}
                onClick={() => pickPreset(p)}
                className={`px-2 py-2 text-xs rounded-lg border text-center transition-colors ${selected === p.label ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600'}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">显示名称 <span className="text-red-400">*</span></label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="例：My LLM"
                value={form.label}
                onChange={e => setForm({...form, label: e.target.value})}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">接口类型</label>
              <select
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={form.apiType}
                onChange={e => setForm({...form, apiType: e.target.value})}
              >
                <option value="openai">OpenAI 兼容</option>
                <option value="claude">Claude (Anthropic)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">模型名称</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="model-name"
              value={form.model}
              onChange={e => setForm({...form, model: e.target.value})}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">API 地址</label>
            <input
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="https://api.example.com/v1"
              value={form.baseUrl}
              onChange={e => setForm({...form, baseUrl: e.target.value})}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
          <button onClick={handleAdd} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">添加</button>
        </div>
      </div>
    </Modal>
  );
}
