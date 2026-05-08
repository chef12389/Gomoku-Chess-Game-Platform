import { UserRound } from 'lucide-react';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';

export function UserPage({ onLogin }: { onLogin: () => void }) {
  const { user, profile, isAdmin } = useAuth();
  return (
    <section className="mx-auto max-w-4xl animate-panel-in">
      <ConfigNotice />
      <div className="panel p-8">
        <div className="flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-lg bg-slate-950 text-amber-200"><UserRound size={30} /></div>
          <div>
            <h1 className="font-serif text-3xl font-semibold">用户中心</h1>
            <p className="mt-1 text-slate-600">查看当前账号、权限和云端状态。</p>
          </div>
        </div>
        {user ? (
          <div className="mt-8 grid grid-cols-3 gap-4 max-md:grid-cols-1">
            <div className="metric"><span>邮箱</span><strong className="truncate">{user.email}</strong></div>
            <div className="metric"><span>昵称</span><strong>{profile?.display_name || '未设置'}</strong></div>
            <div className="metric"><span>角色</span><strong>{isAdmin ? '管理员' : '普通用户'}</strong></div>
          </div>
        ) : (
          <div className="mt-8 rounded-lg bg-white/70 p-6">
            <p className="text-slate-600">你尚未登录。登录后可把棋谱保存到云端，并在后台按权限查看数据。</p>
            <button className="primary-button mt-4" onClick={onLogin}>前往登录</button>
          </div>
        )}
      </div>
    </section>
  );
}
