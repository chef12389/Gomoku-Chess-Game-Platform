import { useState } from 'react';
import { KeyRound, UserPlus, UserRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured, signIn, signUp } from '../lib/supabase';
import { ConfigNotice } from '../components/ConfigNotice';

export function AuthPage({ onDone }: { onDone: () => void }) {
  const { refresh } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('密码至少 6 位。');
      return;
    }
    setLoading(true);
    try {
      if (isRegister) await signUp(email, password, displayName || email.split('@')[0]);
      else await signIn(email, password);
      await refresh();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请检查账号信息。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-3xl animate-panel-in">
      <ConfigNotice />
      <div className="panel grid grid-cols-[.9fr_1.1fr] overflow-hidden max-md:grid-cols-1">
        <div className="bg-slate-950 p-8 text-amber-100">
          <h1 className="font-serif text-3xl font-semibold">账户入口</h1>
          <p className="mt-4 text-sm leading-7 text-amber-100/[.78]">
            登录后可保存棋谱、查看个人记录。管理员登录后会自动显示后台入口。
          </p>
          <div className="mt-8 rounded-lg border border-amber-200/20 p-4 text-sm text-amber-50/80">
            普通用户可以注册账号；管理员账号由系统内置识别。
          </div>
          <button type="button" className="mt-5 w-full rounded-lg border border-amber-200/20 bg-amber-100 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-amber-50" onClick={onDone}>
            <span className="inline-flex items-center gap-2">
              <UserRound size={17} />
              游客登录
            </span>
          </button>
        </div>
        <form className="space-y-4 p-8" onSubmit={submit}>
          <div className="flex items-center gap-3">
            {isRegister ? <UserPlus size={24} /> : <KeyRound size={24} />}
            <h2 className="text-2xl font-semibold">{isRegister ? '注册账号' : '登录账号'}</h2>
          </div>
          {isRegister && (
            <label className="form-label">
              昵称
              <input className="field" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="棋手昵称" />
            </label>
          )}
          <label className="form-label">
            邮箱
            <input className="field" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" />
          </label>
          <label className="form-label">
            密码
            <input className="field" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" />
          </label>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button className="primary-button w-full justify-center" disabled={(!isSupabaseConfigured && isRegister) || loading}>
            {loading ? '处理中...' : isRegister ? '创建账号' : '登录'}
          </button>
          <button type="button" className="w-full text-sm font-medium text-slate-600 hover:text-slate-950" onClick={() => setIsRegister((value) => !value)}>
            {isRegister ? '已有账号，去登录' : '没有账号，去注册'}
          </button>
        </form>
      </div>
    </section>
  );
}
