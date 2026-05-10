import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronsLeft, ChevronsRight, RefreshCw, SkipBack, SkipForward } from 'lucide-react';
import { Board } from '../components/Board';
import { ConfigNotice } from '../components/ConfigNotice';
import { applyMove, createBoard, evaluateTerminal, opponent, serializeMoves } from '../lib/board';
import { fetchGameRecords, fetchLocalGameRecords } from '../lib/supabase';
import { playSound } from '../lib/sound';
import type { Cell, GameRecord, Move, Stone } from '../types';

const soundStorageKey = 'renju.sound.enabled';
const BOARD_FILES = 'ABCDEFGHIJKLMNO'.split('');

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60).toString().padStart(2, '0');
  const sec = (seconds % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function modeLabel(record: GameRecord) {
  if (record.playerMode === 'ai') return '人机对弈';
  if (record.playerMode === 'online') return '在线双人';
  return '本地双人';
}

function winnerLabel(record: GameRecord) {
  if (record.winner === 'black') return '黑方';
  if (record.winner === 'white') return '白方';
  if (record.winner === 'draw') return '平局';
  return '未完成';
}

function pointLabel(move?: Move) {
  if (!move) return '开局';
  return `${move.color === 'black' ? '黑' : '白'} ${move.index} · ${BOARD_FILES[move.col]}${move.row + 1}`;
}

function buildReplayBoard(moves: Move[], replayIndex: number): Cell[][] {
  let board = createBoard();
  moves.slice(0, replayIndex).forEach((move) => {
    board = applyMove(board, move, move.color);
  });
  return board;
}

export function RecordsPage() {
  const [records, setRecords] = useState<GameRecord[]>([]);
  const [selected, setSelected] = useState<GameRecord | null>(null);
  const [replayIndex, setReplayIndex] = useState(0);

  const soundEnabled = typeof window === 'undefined' ? true : localStorage.getItem(soundStorageKey) !== 'false';

  const load = async () => {
    const local = fetchLocalGameRecords();
    setRecords(local);
    setSelected(local[0] || null);
    setReplayIndex(local[0]?.moves.length || 0);
    const data = await fetchGameRecords();
    setRecords(data);
    setSelected(data[0] || null);
    setReplayIndex(data[0]?.moves.length || 0);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    setReplayIndex(selected?.moves.length || 0);
  }, [selected?.id]);

  const replayBoard = useMemo(() => buildReplayBoard(selected?.moves || [], replayIndex), [selected?.moves, replayIndex]);
  const replayMoves = useMemo(() => (selected?.moves || []).slice(0, replayIndex), [selected?.moves, replayIndex]);
  const lastReplayMove = replayMoves[replayMoves.length - 1];
  const replayResult = useMemo(() => {
    if (!selected || replayIndex !== selected.moves.length || !lastReplayMove) return { winner: null, line: [] };
    return evaluateTerminal(replayBoard, lastReplayMove);
  }, [lastReplayMove, replayBoard, replayIndex, selected]);
  const nextColor: Stone = lastReplayMove ? opponent(lastReplayMove.color) : 'black';

  const setStep = (next: number, withSound = false) => {
    if (!selected) return;
    const clamped = Math.max(0, Math.min(selected.moves.length, next));
    setReplayIndex(clamped);
    if (withSound && clamped > replayIndex) playSound('replay', soundEnabled);
  };

  return (
    <section className="animate-panel-in">
      <ConfigNotice />
      <div className="mb-5 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
        <div>
          <h1 className="font-serif text-3xl font-semibold">棋局库</h1>
          <p className="mt-1 text-sm text-slate-600">查看历史对局，并用棋盘逐手复盘。</p>
        </div>
        <button className="secondary-button" onClick={load}><RefreshCw size={17} />刷新</button>
      </div>

      <div className="records-layout">
        <div className="panel records-list">
          {records.length === 0 && <div className="p-8 text-center text-slate-500">暂无棋局，完成对局后会自动保存。</div>}
          {records.map((record) => (
            <button
              key={record.id}
              className={`record-row ${selected?.id === record.id ? 'active' : ''}`}
              onClick={() => setSelected(record)}
            >
              <span className="flex w-full items-center justify-between gap-3 font-semibold">
                <span className="flex items-center gap-2"><BookOpen size={16} />{modeLabel(record)}</span>
                <span className="rounded-md bg-white/55 px-2 py-1 text-xs">{record.moves.length} 手</span>
              </span>
              <span className="text-sm text-slate-500">{new Date(record.createdAt).toLocaleString()}</span>
              <span className="text-sm text-slate-600">结果：{winnerLabel(record)} · 用时 {formatTime(record.durationSeconds)}</span>
            </button>
          ))}
        </div>

        <div className="panel replay-panel p-5">
          {selected ? (
            <>
              <div className="mb-4 flex items-start justify-between gap-4 max-md:flex-col">
                <div>
                  <h2 className="text-xl font-semibold">{modeLabel(selected)}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    {selected.mode === 'standard' ? '指定开局' : '自由开局'} · 结果：{winnerLabel(selected)}
                  </p>
                </div>
                <div className="replay-step-badge">{replayIndex} / {selected.moves.length}</div>
              </div>

              <div className="mb-4 grid grid-cols-4 gap-3 text-sm max-md:grid-cols-2">
                <div className="metric"><span>当前步</span><strong>{pointLabel(lastReplayMove)}</strong></div>
                <div className="metric"><span>下一手</span><strong>{nextColor === 'black' ? '黑方' : '白方'}</strong></div>
                <div className="metric"><span>总用时</span><strong>{formatTime(selected.durationSeconds)}</strong></div>
                <div className="metric"><span>限时</span><strong>{selected.moveTimeLimitSeconds ? `${selected.moveTimeLimitSeconds}s` : '不限'}</strong></div>
              </div>

              <Board board={replayBoard} nextColor={nextColor} moves={replayMoves} winningLine={replayResult.line} readOnly />

              <div className="replay-toolbar mt-4">
                <button className="secondary-button" onClick={() => setStep(0)} disabled={replayIndex === 0}><ChevronsLeft size={17} />开头</button>
                <button className="secondary-button" onClick={() => setStep(replayIndex - 1)} disabled={replayIndex === 0}><SkipBack size={17} />上一步</button>
                <div className="replay-progress" aria-hidden="true">
                  <span style={{ width: `${selected.moves.length ? (replayIndex / selected.moves.length) * 100 : 0}%` }} />
                </div>
                <button className="secondary-button" onClick={() => setStep(replayIndex + 1, true)} disabled={replayIndex === selected.moves.length}><SkipForward size={17} />下一步</button>
                <button className="secondary-button" onClick={() => setStep(selected.moves.length, true)} disabled={replayIndex === selected.moves.length}><ChevronsRight size={17} />末尾</button>
              </div>

              <p className="mt-4 max-h-32 overflow-auto rounded-lg bg-white/60 p-4 font-mono text-sm leading-7 text-slate-700">
                {serializeMoves(selected.moves)}
              </p>
            </>
          ) : (
            <p className="text-slate-500">选择左侧棋局查看复盘。</p>
          )}
        </div>
      </div>
    </section>
  );
}
