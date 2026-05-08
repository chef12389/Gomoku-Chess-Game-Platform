import { useEffect, useState } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import { ConfigNotice } from '../components/ConfigNotice';
import { fetchGameRecords } from '../lib/supabase';
import { serializeMoves } from '../lib/board';
import type { GameRecord } from '../types';

export function RecordsPage() {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [selected, setSelected] = useState<GameRecord | null>(null);

  const load = async () => {
    const data = await fetchGameRecords();
    setRecords(data);
    setSelected(data[0] || null);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="animate-panel-in">
      <ConfigNotice />
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-serif text-3xl font-semibold">棋谱库</h1>
          <p className="mt-1 text-sm text-slate-600">保存、浏览和复盘最近的对局记录。</p>
        </div>
        <button className="secondary-button" onClick={load}><RefreshCw size={17} />刷新</button>
      </div>
      <div className="grid grid-cols-[420px_1fr] gap-6 max-lg:grid-cols-1">
        <div className="panel divide-y divide-slate-200/80">
          {records.length === 0 && <div className="p-8 text-center text-slate-500">暂无棋谱，完成对局后点击保存。</div>}
          {records.map((record) => (
            <button key={record.id} className={`record-row ${selected?.id === record.id ? 'active' : ''}`} onClick={() => setSelected(record)}>
              <span className="flex items-center gap-2 font-semibold"><BookOpen size={16} />{record.openingName || '自由开局'}</span>
              <span className="text-sm text-slate-500">{new Date(record.createdAt).toLocaleString()}</span>
              <span className="text-sm text-slate-600">胜者：{record.winner === 'black' ? '黑方' : record.winner === 'white' ? '白方' : record.winner || '未完结'}</span>
            </button>
          ))}
        </div>
        <div className="panel p-6">
          {selected ? (
            <>
              <h2 className="text-xl font-semibold">{selected.openingName || '自由开局'} · {selected.playerMode === 'ai' ? '人机' : '双人'}</h2>
              <div className="mt-4 grid grid-cols-4 gap-3 text-sm max-md:grid-cols-2">
                <div className="metric"><span>手数</span><strong>{selected.moves.length}</strong></div>
                <div className="metric"><span>耗时</span><strong>{selected.durationSeconds}s</strong></div>
                <div className="metric"><span>模式</span><strong>{selected.mode === 'standard' ? '指定' : '自由'}</strong></div>
                <div className="metric"><span>结果</span><strong>{selected.reason || '记录'}</strong></div>
              </div>
              <p className="mt-5 rounded-lg bg-white/70 p-4 font-mono text-sm leading-7 text-slate-700">{serializeMoves(selected.moves)}</p>
            </>
          ) : (
            <p className="text-slate-500">选择左侧棋谱查看详情。</p>
          )}
        </div>
      </div>
    </section>
  );
}
