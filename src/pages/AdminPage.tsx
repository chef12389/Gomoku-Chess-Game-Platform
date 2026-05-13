import { useEffect, useState } from 'react';
import { BarChart3, Bot, Trash2, UsersRound, Swords, ShieldAlert } from 'lucide-react';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';
import { deleteGameRecord, fetchGameRecords, fetchProfiles, fetchStats } from '../lib/supabase';
import type { AppStats, GameRecord, Profile } from '../types';

export function AdminPage() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [stats, setStats] = useState<AppStats>({ userCount: 0, matchCount: 0, aiWinRate: 0 });

  const load = async () => {
    const [profileData, recordData, statData] = await Promise.all([
      fetchProfiles().catch(() => []),
      fetchGameRecords().catch(() => []),
      fetchStats().catch(() => ({ userCount: 0, matchCount: 0, aiWinRate: 0 })),
    ]);
    setProfiles(profileData);
    setRecords(recordData);
    setStats(statData);
  };

  useEffect(() => {
    void load();
  }, []);

  const remove = async (id: string) => {
    await deleteGameRecord(id);
    await load();
  };

  if (!isAdmin) {
    return (
      <section className="panel mx-auto max-w-2xl p-10 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-red-50 text-red-400">
          <ShieldAlert size={28} />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">无后台权限</h1>
        <p className="mt-3 text-slate-500">请使用环境变量中指定的管理员邮箱登录。</p>
      </section>
    );
  }

  return (
    <section className="animate-panel-in">
      <ConfigNotice />
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-bold text-slate-900">管理员后台</h1>
        <p className="mt-1 text-sm text-slate-500">管理用户、对局记录和全站统计。</p>
      </div>

      {/* Stats */}
      <div className="mb-6 grid grid-cols-3 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <div className="metric">
          <span className="flex items-center gap-1.5"><UsersRound size={12} />用户数</span>
          <strong>{stats.userCount}</strong>
        </div>
        <div className="metric">
          <span className="flex items-center gap-1.5"><Swords size={12} />对局数</span>
          <strong>{stats.matchCount}</strong>
        </div>
        <div className="metric">
          <span className="flex items-center gap-1.5"><Bot size={12} />AI 胜率</span>
          <strong>{stats.aiWinRate}%</strong>
        </div>
      </div>

      {/* Users table */}
      <div className="panel p-5 mb-6">
        <h2 className="section-title mb-4"><UsersRound size={16} />用户数据</h2>
        <div className="overflow-auto rounded-xl">
          <table className="data-table">
            <thead>
              <tr>
                <th className="rounded-tl-xl">邮箱</th>
                <th>昵称</th>
                <th>角色</th>
                <th className="rounded-tr-xl">创建时间</th>
              </tr>
            </thead>
            <tbody>
              {profiles.map((profile) => (
                <tr key={profile.id}>
                  <td className="font-medium text-slate-800">{profile.email}</td>
                  <td>{profile.display_name || '-'}</td>
                  <td>
                    <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-bold ${
                      profile.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {profile.role === 'admin' ? '管理员' : '用户'}
                    </span>
                  </td>
                  <td>{new Date(profile.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
              {profiles.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-400 py-8">暂无用户数据或 Supabase 未配置。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Records table */}
      <div className="panel p-5">
        <h2 className="section-title mb-4"><BarChart3 size={16} />对局记录</h2>
        <div className="overflow-auto rounded-xl">
          <table className="data-table">
            <thead>
              <tr>
                <th className="rounded-tl-xl">时间</th>
                <th>用户</th>
                <th>模式</th>
                <th>胜者</th>
                <th>手数</th>
                <th className="rounded-tr-xl">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td className="text-xs">{new Date(record.createdAt).toLocaleString()}</td>
                  <td className="font-medium text-slate-800">{record.userEmail || '本地访客'}</td>
                  <td>
                    <span className={`inline-flex rounded-lg px-2 py-0.5 text-xs font-bold ${
                      record.playerMode === 'ai' ? 'bg-blue-50 text-blue-600' :
                      record.playerMode === 'online' ? 'bg-amber-50 text-amber-700' :
                      'bg-emerald-50 text-emerald-700'
                    }`}>
                      {record.playerMode === 'ai' ? '人机' : record.playerMode === 'online' ? '在线双人' : '本地双人'}
                    </span>
                  </td>
                  <td className="font-semibold">{record.winner || '-'}</td>
                  <td>{record.moves.length}</td>
                  <td>
                    <button
                      className="icon-button h-9 w-9"
                      onClick={() => remove(record.id)}
                      aria-label="删除对局"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr><td colSpan={6} className="text-center text-slate-400 py-8">暂无对局记录。对局结束后会自动保存。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
