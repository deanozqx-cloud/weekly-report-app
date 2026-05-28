import { useState } from 'react';
import { sb } from '../../lib/supabase';

export default function AuthPage({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!email.trim() || !password) { setError('请填写邮箱和密码'); return; }
    setLoading(true);
    setError('');
    try {
      if (mode === 'login') {
        const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onLogin(data.user);
      } else {
        if (!displayName.trim()) { setError('请填写姓名'); setLoading(false); return; }
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        });
        if (error) throw error;
        if (data.user && !data.session) {
          setError('注册成功！请前往邮箱点击确认链接后再登录。');
          setLoading(false);
          return;
        }
        onLogin(data.user);
      }
    } catch (e) {
      const errorMap = {
        'Invalid login credentials': '邮箱或密码错误',
        'User already registered': '该邮箱已被注册',
        'Email not confirmed': '邮箱尚未确认，请查收确认邮件',
      };
      setError(errorMap[e.message] || e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-sm mx-4 p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-500 rounded-xl flex items-center justify-center text-white font-bold text-xl mx-auto mb-3">周</div>
          <h1 className="text-xl font-semibold text-gray-800">周报助手</h1>
          <p className="text-sm text-gray-400 mt-1">{mode === 'login' ? '登录账号继续使用' : '注册新账号'}</p>
        </div>

        <div className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
              <input
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                placeholder="您的姓名"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
              />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
            <input
              type="email"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="name@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密码</label>
            <input
              type="password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2.5 rounded-lg font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (mode === 'login' ? '登录中…' : '注册中…') : (mode === 'login' ? '登录' : '注册')}
          </button>
        </div>

        <div className="text-center mt-5">
          <button
            onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {mode === 'login' ? '没有账号？立即注册' : '已有账号？去登录'}
          </button>
        </div>
      </div>
    </div>
  );
}
