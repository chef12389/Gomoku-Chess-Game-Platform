import { useEffect, useState } from 'react';
import { BarChart3, Database, Trash2, UsersRound } from 'lucide-react';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';
import { deleteGameRecord, fetchGameRecords, fetchOpenings, fetchProfiles, fetchStats } from '../lib/supabase';
import type { AppStats, GameRecord, OpeningDefinition, Profile } from '../types';

export function AdminPage() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [openings, setOpenings] = useState<OpeningDefinition[]>([]);
  const [stats, setStats] = useState<AppStats>({ userCount: 0, matchCount: 0, aiWinRate: 0, popularOpening: '暂无数据' });

  const load = async () => {
    const [profileData, recordData, openingData, statData] = await Promise.all([
      fetchProfiles().catch(() => []),
      fetchGameRecords().catch(() => []),
      fetchOpenings().catch(() => []),
      fetchStats().catch(() => ({ userCount: 0, matchCount: 0, aiWinRate: 0, popularOpening: '暂无数据' })),
    ]);
    setProfiles(profileData);
    setRecords(recordData);
    setOpenings(openingData);
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
      <section className="panel mx-auto max-w-2xl p-8 text-center">
        <h1 className="text-2xl font-semibold">无后台权限</h1>
        <p className="mt-3 text-slate-600">请使用环境变量中指定的管理员邮箱登录。</p>
      </section>
    );
  }

  return (
    <section className="animate-panel-in">
      <ConfigNotice />
      <div className="mb-6">
        <h1 className="font-serif text-3xl font-semibold">管理员后台</h1>
        <p className="mt-1 text-sm text-slate-600">管理用户、对局记录、开局数据和全站统计。</p>
      </div>
      <div className="mb-6 grid grid-cols-4 gap-4 max-lg:grid-cols-2">
        <div className="metric"><span>用户数</span><strong>{stats.userCount}</strong></div>
        <div className="metric"><span>对局数</span><strong>{stats.matchCount}</strong></div>
        <div className="metric"><span>AI 胜率</span><strong>{stats.aiWinRate}%</strong></div>
        <div className="metric"><span>热门开局</span><strong>{stats.popularOpening}</strong></div>
      </div>
      <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <div className="panel p-5">
          <h2 className="section-title"><UsersRound size={18} />用户数据</h2>
          <div className="mt-4 overflow-auto">
            <table className="data-table">
              <thead><tr><th>邮箱</th><th>昵称</th><th>角色</th><th>创建时间</th></tr></thead>
              <tbody>
                {profiles.map((profile) => (
                  <tr key={profile.id}>
                    <td>{profile.email}</td>
                    <td>{profile.display_name || '-'}</td>
                    <td>{profile.role}</td>
                    <td>{new Date(profile.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
                {profiles.length === 0 && <tr><td colSpan={4}>暂无用户数据或 Supabase 未配置。</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
        <div className="panel p-5">
          <h2 className="section-title"><Database size={18} />开局数据</h2>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
            {openings.map((opening) => (
              <div key={opening.id} className="rounded-md bg-white/70 px-3 py-2">
                <span className="font-medium">{opening.name}</span>
                <span className="ml-2 text-slate-500">{opening.family === 'direct' ? '直指' : '斜指'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel mt-6 p-5">
        <h2 className="section-title"><BarChart3 size={18} />对局记录</h2>
        <div className="mt-4 overflow-auto">
          <table className="data-table">
            <thead><tr><th>时间</th><th>用户</th><th>模式</th><th>开局</th><th>胜者</th><th>手数</th><th>操作</th></tr></thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{new Date(record.createdAt).toLocaleString()}</td>
                  <td>{record.userEmail || '本地访客'}</td>
                  <td>{record.playerMode === 'ai' ? '人机' : '双人'}</td>
                  <td>{record.openingName || '自由'}</td>
                  <td>{record.winner || '-'}</td>
                  <td>{record.moves.length}</td>
                  <td><button className="icon-button" onClick={() => remove(record.id)} aria-label="删除对局"><Trash2 size={16} /></button></td>
                </tr>
              ))}
              {records.length === 0 && <tr><td colSpan={7}>暂无对局记录。</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
