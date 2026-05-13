import { Crown, Mail, Shield, UserRound } from 'lucide-react';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';

export function UserPage({ onLogin }: { onLogin: () => void }) {
  const { user, profile, isAdmin } = useAuth();

  return (
    <section className="mx-auto max-w-4xl animate-panel-in">
      <ConfigNotice />
      <div className="panel p-8">
        {/* Header */}
        <div className="flex items-center gap-5">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-950 text-amber-300 shadow-lg">
            <UserRound size={28} />
          </div>
          <div>
            <h1 className="font-serif text-3xl font-bold text-slate-900">用户中心</h1>
            <p className="mt-1 text-sm text-slate-500">查看当前账号、权限和云端状态。</p>
          </div>
        </div>

        {user ? (
          <>
            {/* User info cards */}
            <div className="mt-8 grid grid-cols-3 gap-4 max-md:grid-cols-1">
              <div className="metric">
                <span className="flex items-center gap-1.5"><Mail size={12} />邮箱</span>
                <strong className="truncate text-base">{user.email}</strong>
              </div>
              <div className="metric">
                <span className="flex items-center gap-1.5"><UserRound size={12} />昵称</span>
                <strong className="text-base">{profile?.display_name || '未设置'}</strong>
              </div>
              <div className="metric">
                <span className="flex items-center gap-1.5"><Shield size={12} />角色</span>
                <strong className="text-base flex items-center gap-2">
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                      <Crown size={11} />管理员
                    </span>
                  ) : (
                    '普通用户'
                  )}
                </strong>
              </div>
            </div>

            {/* Account info */}
            <div className="mt-6 rounded-2xl border border-white/40 p-5"
              style={{
                background: 'linear-gradient(175deg, rgba(255,255,255,.52) 0%, rgba(255,255,255,.36) 100%)',
              }}
            >
              <h3 className="text-sm font-bold text-slate-700 mb-3">账号信息</h3>
              <div className="grid grid-cols-2 gap-4 text-sm max-md:grid-cols-1">
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">用户 ID</span>
                  <p className="mt-1 font-mono text-slate-700">{user.id}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">认证方式</span>
                  <p className="mt-1 text-slate-700">
                    {user.app_metadata?.provider || 'email'}
                  </p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="mt-8 rounded-2xl border border-white/40 p-8 text-center"
            style={{
              background: 'linear-gradient(175deg, rgba(255,255,255,.52) 0%, rgba(255,255,255,.36) 100%)',
            }}
          >
            <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400">
              <UserRound size={28} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">尚未登录</h2>
            <p className="text-sm text-slate-600 max-w-sm mx-auto leading-relaxed">
              登录后可把棋谱保存到云端，并在后台按权限查看数据。
            </p>
            <button className="primary-button mt-6" onClick={onLogin}>前往登录</button>
          </div>
        )}
      </div>
    </section>
  );
}
