import { useState } from 'react';
import { KeyRound, UserPlus, UserRound, Swords, History, Sparkles, ArrowRight } from 'lucide-react';
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
    { id: 'login', title: '登录账号', desc: '同步棋局与记录', icon: KeyRound },
    { id: 'register', title: '注册账号', desc: '创建新身份', icon: UserPlus },
    { id: 'guest', title: '访客模式', desc: '直接体验', icon: UserRound },
  ];

  return (
    <section className="auth-screen relative flex min-h-screen w-full items-center justify-center py-4 lg:py-8 animate-panel-in">
      <ConfigNotice />
      <div className="relative z-10 flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl shadow-2xl ring-1 ring-white/40 lg:flex-row"
        style={{
          background: 'linear-gradient(175deg, rgba(255,255,255,.72) 0%, rgba(255,255,255,.52) 100%)',
          backdropFilter: 'blur(28px) saturate(1.3)',
        }}
      >
        {/* Left Banner */}
        <div className="relative flex flex-1 flex-col justify-center overflow-hidden p-10 lg:p-14">
          {/* Background decorations */}
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950" />
          <div className="absolute -left-16 -top-16 h-56 w-56 rounded-full bg-amber-400/15 blur-3xl" />
          <div className="absolute -bottom-28 -right-28 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
          <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/5 blur-3xl" />

          <div className="relative z-10">
            <h1 className="text-4xl font-bold leading-tight tracking-tight text-white drop-shadow-lg lg:text-[52px]">
              欢迎来到
              <br />
              <span className="mt-2 inline-block bg-gradient-to-r from-amber-200 via-amber-400 to-amber-300 bg-clip-text text-transparent">
                五子棋对弈平台
              </span>
            </h1>

            <p className="mt-6 max-w-md text-lg leading-relaxed text-slate-200/90 drop-shadow-md">
              在这里，你可以成为棋盘上的棋逢对手。选择一种身份开始，记录你的每一次精彩落子，与各路高手切磋技艺。
            </p>

            <div className="mt-10 grid grid-cols-2 gap-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
                  <Swords className="text-amber-300" size={20} />
                </div>
                <h3 className="font-semibold text-white drop-shadow-md">随时随地对弈</h3>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20 backdrop-blur-md">
                  <History className="text-amber-300" size={20} />
                </div>
                <h3 className="font-semibold text-white drop-shadow-md">棋局复盘</h3>
              </div>
            </div>
          </div>
        </div>

        {/* Right Form Area */}
        <div className="relative z-10 flex w-full flex-col justify-center bg-white/90 p-8 shadow-[-20px_0_40px_rgba(0,0,0,0.08)] lg:w-[460px] lg:p-12">
          {/* Mode selector */}
          <div className="grid grid-cols-3 gap-2.5">
            {authOptions.map((item) => {
              const Icon = item.icon;
              const isActive = mode === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`flex flex-col items-center justify-center rounded-2xl p-3 transition-all duration-300 ${
                    isActive
                      ? 'bg-gradient-to-br from-amber-100 to-amber-200/80 text-amber-900 shadow-md ring-1 ring-amber-300/60 scale-[1.03]'
                      : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:scale-[1.02]'
                  }`}
                  onClick={() => { setMode(item.id); setError(''); }}
                >
                  <Icon size={20} className={isActive ? 'text-amber-600 mb-1.5' : 'mb-1.5 opacity-50'} />
                  <span className="text-[12px] font-bold">{item.title}</span>
                </button>
              );
            })}
          </div>

          <form className="flex flex-col" onSubmit={submit}>
            {mode === 'guest' ? (
              <div className="mt-6 rounded-3xl border border-slate-200/60 bg-gradient-to-br from-slate-50 to-white p-8 text-center shadow-inner">
                <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-amber-200 text-amber-600 ring-4 ring-amber-50 shadow-md">
                  <UserRound size={36} />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 mb-3">直接体验对局</h2>
                <p className="text-sm text-slate-600 leading-relaxed mb-8">
                  你可以立即开始人机对弈或本地双人模式；如果你需要云端保存或在线对战，请先登录账号。
                </p>
                <button type="submit" className="primary-button w-full h-14 text-lg rounded-2xl">
                  以访客身份进入
                  <ArrowRight size={20} />
                </button>
              </div>
            ) : (
              <div className="animate-panel-in mt-6 space-y-5">
                <div>
                  <h2 className="text-3xl font-bold text-slate-900">{isRegister ? '创建新账号' : '欢迎回来'}</h2>
                  <p className="text-sm text-slate-500 mt-2">
                    {isRegister ? '填写以下信息开启你的棋弈之旅' : '登录你的账号以继续对弈'}
                  </p>
                </div>

                {isRegister && (
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">昵称</label>
                    <input
                      className="field"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="请输入棋手称号"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">电子邮箱</label>
                  <input
                    className="field"
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="name@example.com"
                  />
                </div>

                <div>
                  <label className="block text-[13px] font-bold text-slate-700 mb-2 uppercase tracking-wide">登录密码</label>
                  <input
                    className="field"
                    type="password"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="至少 6 位字符"
                  />
                </div>

                {error && (
                  <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600 border border-red-100 font-medium">
                    {error}
                  </div>
                )}

                <button
                  className="primary-button w-full h-14 text-[16px] rounded-2xl"
                  disabled={(!isSupabaseConfigured && isRegister) || loading}
                >
                  {loading ? '正在处理...' : isRegister ? '立即注册' : '登录'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
