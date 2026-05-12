import { useState } from 'react';
import { KeyRound, UserPlus, UserRound, Swords, History, Sparkles } from 'lucide-react';
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
    { id: 'login', title: '登录账号', desc: '同步棋谱与记录', icon: KeyRound },
    { id: 'register', title: '注册账号', desc: '创建新身份', icon: UserPlus },
    { id: 'guest', title: '游客模式', desc: '直接体验', icon: UserRound },
  ];

  return (
    <section className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center py-4 lg:py-8 animate-panel-in">
      <ConfigNotice />
      <div className="flex w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white/30 shadow-2xl backdrop-blur-xl ring-1 ring-white/50 lg:flex-row">
        
        {/* Left Banner Area */}
        <div className="relative flex flex-1 flex-col justify-center p-10 lg:p-14 text-white bg-slate-900/60 overflow-hidden">
           <div className="absolute inset-0 bg-gradient-to-br from-amber-500/20 to-indigo-900/40 mix-blend-overlay"></div>
           <div className="relative z-10">
               <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-400/20 px-4 py-1.5 text-sm font-semibold text-amber-200 backdrop-blur-md shadow-glow">
                 <Sparkles size={16} /> <span>全新升级的对弈体验</span>
               </div>
               <h1 className="text-4xl font-bold tracking-tight lg:text-[54px] drop-shadow-lg text-white leading-tight">
                  欢迎来到<br/>
                  <span className="mt-2 block bg-gradient-to-r from-amber-300 to-amber-500 bg-clip-text text-transparent">五子棋对弈平台</span>
               </h1>
               <p className="mt-6 text-lg leading-relaxed text-slate-200 drop-shadow-md max-w-md">
                  在这里，你可以体验纯粹的棋盘博弈。选择一种身份开始，记录你的每一次精妙落子，与各路高手切磋技艺。
               </p>
               <div className="mt-12 grid grid-cols-2 gap-6">
                  <div className="flex flex-col gap-3">
                     <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/30 shadow-inner backdrop-blur-md">
                        <Swords className="text-amber-400" size={24} />
                     </div>
                     <div>
                       <h3 className="font-semibold text-white text-lg">云端对弈</h3>
                       <p className="text-sm text-slate-300 mt-1">随时随地，数据漫游</p>
                     </div>
                  </div>
                  <div className="flex flex-col gap-3">
                     <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/30 shadow-inner backdrop-blur-md">
                        <History className="text-amber-400" size={24} />
                     </div>
                     <div>
                       <h3 className="font-semibold text-white text-lg">棋谱复盘</h3>
                       <p className="text-sm text-slate-300 mt-1">回味经典，提升棋力</p>
                     </div>
                  </div>
               </div>
           </div>
        </div>

        {/* Right Form Area */}
        <div className="w-full bg-white/95 p-8 lg:w-[460px] lg:p-12 relative flex flex-col justify-center shadow-[-20px_0_40px_rgba(0,0,0,0.1)] z-10">
            
            <div className="grid grid-cols-3 gap-3 mb-8">
              {authOptions.map((item) => {
                const Icon = item.icon;
                const isActive = mode === item.id;
                return (
                  <button 
                    key={item.id} 
                    type="button" 
                    className={`flex flex-col items-center justify-center rounded-2xl p-3 transition-all duration-300 ${isActive ? 'bg-amber-100 text-amber-900 shadow-md ring-1 ring-amber-400 scale-105' : 'bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`} 
                    onClick={() => { setMode(item.id); setError(''); }}
                  >
                    <Icon size={22} className={isActive ? 'text-amber-600 mb-2' : 'mb-2 opacity-60'} />
                    <span className="text-sm font-bold">{item.title}</span>
                  </button>
                );
              })}
            </div>

            <form className="flex flex-col space-y-5" onSubmit={submit}>
              {mode === 'guest' ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center shadow-inner mt-4">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-600 ring-4 ring-amber-50">
                    <UserRound size={32} />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">直接体验对局</h2>
                  <p className="text-sm text-slate-600 leading-relaxed mb-8">
                    您可以立刻开始人机对战或本地双人模式；如果您需要云端保存或在线对战，请先登录账号。
                  </p>
                  <button type="submit" className="primary-button w-full h-12 text-lg">以游客身份进入</button>
                </div>
              ) : (
                <div className="animate-panel-in space-y-5">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-slate-900">{isRegister ? '创建新账号' : '欢迎回来'}</h2>
                    <p className="text-sm text-slate-500 mt-1">{isRegister ? '填写以下信息开启你的围棋之旅' : '登录你的账号以继续对弈'}</p>
                  </div>
                  
                  {isRegister && (
                    <div>
                      <label className="block text-sm font-bold text-slate-700 mb-1.5">昵称</label>
                      <input 
                        className="w-full rounded-xl border-0 bg-slate-100 px-4 py-3.5 text-slate-900 ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-amber-500 transition-all outline-none" 
                        value={displayName} 
                        onChange={(event) => setDisplayName(event.target.value)} 
                        placeholder="请输入棋手昵称" 
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">邮箱账号</label>
                    <input 
                      className="w-full rounded-xl border-0 bg-slate-100 px-4 py-3.5 text-slate-900 ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-amber-500 transition-all outline-none" 
                      type="email" 
                      required 
                      value={email} 
                      onChange={(event) => setEmail(event.target.value)} 
                      placeholder="name@example.com" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-slate-700 mb-1.5">登录密码</label>
                    <input 
                      className="w-full rounded-xl border-0 bg-slate-100 px-4 py-3.5 text-slate-900 ring-1 ring-inset ring-slate-200 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-amber-500 transition-all outline-none" 
                      type="password" 
                      required 
                      value={password} 
                      onChange={(event) => setPassword(event.target.value)} 
                      placeholder="至少 6 位字符" 
                    />
                  </div>
                  {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600 border border-red-100">{error}</div>}
                  <button 
                    className="primary-button w-full h-12 mt-4 text-lg" 
                    disabled={(!isSupabaseConfigured && isRegister) || loading}
                  >
                    {loading ? '正在处理...' : isRegister ? '立即注册' : '登 录'}
                  </button>
                </div>
              )}
            </form>
        </div>
      </div>
    </section>
  );
}
