import { useState } from 'react';
import { KeyRound, UserPlus, UserRound } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { isSupabaseConfigured, signIn, signUp } from '../lib/supabase';
import { ConfigNotice } from '../components/ConfigNotice';

type AuthMode = 'login' | 'register' | 'guest';

export function AuthPage({ onDone }: { onDone: () => void }) {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const isRegister = mode === 'register';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === 'guest') {
      onDone();
      return;
    }
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

  const authOptions: Array<{ id: AuthMode; title: string; desc: string; icon: typeof KeyRound }> = [
    { id: 'login', title: '登录账号', desc: '同步棋谱与个人记录', icon: KeyRound },
    { id: 'register', title: '注册账号', desc: '创建新的棋手身份', icon: UserPlus },
    { id: 'guest', title: '游客进入', desc: '直接体验本地对弈', icon: UserRound },
  ];

  return (
    <section className="auth-screen animate-panel-in">
      <ConfigNotice />
      <div className="auth-hero">
        <div>
          <p className="text-sm font-semibold tracking-[.24em] text-amber-700">RENJU ARENA</p>
          <h1 className="mt-4 font-serif text-5xl font-semibold leading-tight text-slate-950 max-md:text-4xl">进入弈境</h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-slate-600">
            选择一种身份开始对弈。登录和注册用于云端记录，游客模式适合快速体验。
          </p>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-mode-grid">
          {authOptions.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={`auth-mode-card ${mode === item.id ? 'active' : ''}`} onClick={() => { setMode(item.id); setError(''); }}>
                <Icon size={22} />
                <span>{item.title}</span>
                <small>{item.desc}</small>
              </button>
            );
          })}
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'guest' ? (
            <div className="guest-panel">
              <UserRound size={34} />
              <div>
                <h2>游客进入</h2>
                <p>可体验人机、本地对弈和本机棋谱；登录后可使用云端保存、在线对弈和后台能力。</p>
              </div>
              <button type="submit" className="primary-button justify-center">进入首页</button>
            </div>
          ) : (
            <>
              <div className="auth-form-heading">
                {isRegister ? <UserPlus size={24} /> : <KeyRound size={24} />}
                <h2>{isRegister ? '注册账号' : '登录账号'}</h2>
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
            </>
          )}
        </form>
      </div>
    </section>
  );
}
