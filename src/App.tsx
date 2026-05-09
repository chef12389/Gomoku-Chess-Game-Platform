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
  { id: 'records', label: '棋局库', icon: BookOpen },
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
    <div className="app-shell">
      <header className="glass-header">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-4 max-md:flex-wrap max-md:px-4 max-md:py-3">
          <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setView('game')} aria-label="回到对弈大厅">
            <span className="brand-mark">
              <Crown size={22} />
            </span>
            <span className="min-w-0">
              <span className="block font-serif text-2xl font-semibold max-md:text-xl">弈境</span>
              <span className="block truncate text-xs uppercase tracking-[.22em] text-slate-500 max-sm:max-w-36">Renju Pro Arena</span>
            </span>
          </button>
          <nav className="flex items-center gap-2 max-md:order-3 max-md:w-full max-md:overflow-x-auto max-md:pb-1">
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
          <div className="flex min-w-0 items-center gap-2">
            {user ? (
              <>
                <span className="max-w-44 truncate text-sm text-slate-600 max-sm:hidden">{user.email}</span>
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
      <main className="relative z-10 mx-auto max-w-7xl px-6 py-8 max-md:px-3 max-md:py-4">
        {view === 'game' && <GamePage />}
        {view === 'records' && <RecordsPage />}
        {view === 'user' && <UserPage onLogin={() => setView('auth')} />}
        {view === 'auth' && <AuthPage onDone={() => setView('game')} />}
        {view === 'admin' && <AdminPage />}
      </main>
    </div>
  );
}
