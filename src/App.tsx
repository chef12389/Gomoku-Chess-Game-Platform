import { useState } from 'react';
import { BarChart3, BookOpen, Crown, LogIn, LogOut, Swords, UserRound } from 'lucide-react';
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
  const [view, setView] = useState<View>('game');
  const { user, isAdmin, refresh } = useAuth();

  const logout = async () => {
    await signOut();
    await refresh();
    setView('game');
  };

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_20%_0%,#f4e3ba_0,#f8fafc_34%,#dbe7e3_100%)] text-slate-950">
      <header className="sticky top-0 z-30 border-b border-white/60 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <button className="flex items-center gap-3 text-left" onClick={() => setView('game')} aria-label="回到对弈大厅">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-950 text-amber-200 shadow-glow">
              <Crown size={22} />
            </span>
            <span>
              <span className="block font-serif text-2xl font-semibold">弈境</span>
              <span className="block text-xs uppercase tracking-[.22em] text-slate-500">Renju Pro Arena</span>
            </span>
          </button>
          <nav className="flex items-center gap-2">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={`nav-button ${view === item.id ? 'nav-button-active' : ''}`} onClick={() => setView(item.id)}>
                  <Icon size={17} />
                  {item.label}
                </button>
              );
            })}
            {isAdmin && (
              <button className={`nav-button ${view === 'admin' ? 'nav-button-active' : ''}`} onClick={() => setView('admin')}>
                <BarChart3 size={17} />
                管理后台
              </button>
            )}
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <span className="max-w-44 truncate text-sm text-slate-600">{user.email}</span>
                <button className="icon-button" onClick={logout} aria-label="退出登录">
                  <LogOut size={18} />
                </button>
              </>
            ) : (
              <button className="primary-button" onClick={() => setView('auth')}>
                <LogIn size={18} />
                登录 / 注册
              </button>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-8">
        {view === 'game' && <GamePage />}
        {view === 'records' && <RecordsPage />}
        {view === 'user' && <UserPage onLogin={() => setView('auth')} />}
        {view === 'auth' && <AuthPage onDone={() => setView('game')} />}
        {view === 'admin' && <AdminPage />}
      </main>
    </div>
  );
}
