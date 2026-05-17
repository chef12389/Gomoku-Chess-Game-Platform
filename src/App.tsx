import { useEffect, useRef, useState } from 'react';
import { BarChart3, BookOpen, LogIn, LogOut, Swords, UserRound } from 'lucide-react';
import { useAuth } from './hooks/useAuth';
import { signOut } from './lib/supabase';
import { AdminPage } from './pages/AdminPage';
import { AuthPage } from './pages/AuthPage';
import { GamePage } from './pages/GamePage';
import { RecordsPage } from './pages/RecordsPage';
import { UserPage } from './pages/UserPage';

type View = 'game' | 'records' | 'user' | 'admin' | 'auth';

const nav = [
  { id: 'game', label: '对弈大厅', icon: Swords },
  { id: 'records', label: '棋谱库', icon: BookOpen },
  { id: 'user', label: '用户中心', icon: UserRound },
] as const;

export default function App() {
  const shellRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>('auth');
  const [hasEntered, setHasEntered] = useState(false);
  const { user, isAdmin, loading, refresh } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      setHasEntered(true);
      setView('game');
    }
  }, [loading, user]);

  const logout = async () => {
    await signOut();
    await refresh();
    setHasEntered(false);
    setView('auth');
  };

  const enterHome = () => {
    setHasEntered(true);
    setView('game');
  };

  const canUseApp = hasEntered || Boolean(user);

  if (!canUseApp) {
    return (
      <div ref={shellRef} className="app-shell">
        <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 max-md:px-3 max-md:py-4">
          <AuthPage onDone={enterHome} />
        </main>
      </div>
    );
  }

  return (
    <div ref={shellRef} className="app-shell">
      <header className="glass-header">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3 max-md:flex-wrap max-md:px-4 max-md:py-2.5">
          {/* Brand */}
          <button
            className="flex min-w-0 shrink-0 items-center gap-3 text-left group"
            onClick={() => setView('game')}
            aria-label="回到对弈大厅"
          >
            <div className="h-10 w-10 rounded-xl bg-white p-0.5">
              <img src={`${import.meta.env.BASE_URL}myChess.ico`} alt="Logo" className="h-full w-full rounded-lg object-cover" />
            </div>
            <span className="min-w-0 hidden sm:block">
              <span className="block font-serif text-xl font-bold tracking-tight text-slate-900">弈境</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[.28em] text-amber-700/70">
                Renju Pro Arena
              </span>
            </span>
          </button>

          {/* Divider */}
          <span className="h-7 w-px bg-gradient-to-b from-transparent via-slate-300/60 to-transparent shrink-0 max-md:hidden" />

          {/* Nav */}
          <nav className="flex items-center gap-1.5 max-md:order-3 max-md:w-full max-md:overflow-x-auto max-md:pb-0.5">
            {nav.map((item) => {
              const Icon = item.icon;
              const isActive = view === item.id;
              return (
                <button
                  key={item.id}
                  className={`nav-button ${isActive ? 'nav-button-active' : ''}`}
                  onClick={() => setView(item.id)}
                >
                  <Icon size={16} />
                  {item.label}
                </button>
              );
            })}
            {isAdmin && (
              <button
                className={`nav-button ${view === 'admin' ? 'nav-button-active' : ''}`}
                onClick={() => setView('admin')}
              >
                <BarChart3 size={16} />
                管理后台
              </button>
            )}
          </nav>

          {/* Spacer */}
          <span className="flex-1 max-md:hidden" />

          {/* User area */}
          <div className="flex items-center gap-2 shrink-0">
            {user ? (
              <>
                <div className="flex items-center gap-2.5 rounded-xl border border-white/50 px-3 py-1.5 bg-white/40 backdrop-blur-md max-sm:hidden">
                  <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-[11px] font-bold text-white shadow-inner">
                    {user.email ? user.email.charAt(0).toUpperCase() : 'G'}
                  </span>
                  <span className="max-w-36 truncate text-sm font-medium text-slate-700">{user.email}</span>
                </div>
                <button className="icon-button" onClick={logout} aria-label="退出登录">
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <button className="primary-button" onClick={() => setView('auth')}>
                <LogIn size={17} />
                登录 / 注册
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 max-md:px-3 max-md:py-4">
        {view === 'game' && <GamePage onNavigate={setView} />}
        {view === 'records' && <RecordsPage />}
        {view === 'user' && <UserPage onLogin={() => setView('auth')} />}
        {view === 'auth' && <AuthPage onDone={enterHome} />}
        {view === 'admin' && <AdminPage />}
      </main>
    </div>
  );
}
