import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronsLeft, ChevronsRight, RefreshCw, SkipBack, SkipForward, Clock3, Hash } from 'lucide-react';
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
      <div className="mb-6 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900">棋谱库</h1>
          <p className="mt-1 text-sm text-slate-500">查看历史对局，并用棋盘逐手复盘。</p>
        </div>
        <button className="secondary-button" onClick={load}>
          <RefreshCw size={17} />刷新
        </button>
      </div>

      <div className="records-layout">
        {/* Record List */}
        <div className="panel records-list">
          {records.length === 0 && (
            <div className="p-10 text-center text-slate-500">
              <BookOpen size={32} className="mx-auto mb-3 opacity-30" />
              <p>暂无棋局</p>
              <p className="text-xs mt-1">完成对局后会自动保存。</p>
            </div>
          )}
          {records.map((record) => (
            <button
              key={record.id}
              className={`record-row ${selected?.id === record.id ? 'active' : ''}`}
              onClick={() => setSelected(record)}
            >
              <div className="flex w-full items-center justify-between gap-3">
                <span className="flex items-center gap-2 font-semibold text-slate-800">
                  <BookOpen size={15} />
                  {modeLabel(record)}
                </span>
                <span className="rounded-lg bg-white/60 px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  {record.moves.length} 手
                </span>
              </div>
              <span className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                <Clock3 size={11} />
                {new Date(record.createdAt).toLocaleString()}
              </span>
              <span className="text-xs text-slate-600 mt-0.5">
                结果：{winnerLabel(record)} · 用时 {formatTime(record.durationSeconds)}
              </span>
            </button>
          ))}
        </div>

        {/* Replay Panel */}
        <div className="panel replay-panel p-5">
          {selected ? (
            <>
              <div className="mb-5 flex items-start justify-between gap-4 max-md:flex-col">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{modeLabel(selected)}</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {selected.mode === 'standard' ? '指定开局' : '自由开局'} · 结果：{winnerLabel(selected)}
                  </p>
                </div>
                <div className="replay-step-badge">
                  <Hash size={14} className="inline mr-1" />
                  {replayIndex} / {selected.moves.length}
                </div>
              </div>

              {/* Stats row */}
              <div className="mb-5 grid grid-cols-4 gap-3 text-sm max-md:grid-cols-2">
                <div className="metric"><span>当前步</span><strong className="text-lg">{pointLabel(lastReplayMove)}</strong></div>
                <div className="metric"><span>下一手</span><strong className="text-lg">{nextColor === 'black' ? '黑方' : '白方'}</strong></div>
                <div className="metric"><span>总用时</span><strong className="text-lg">{formatTime(selected.durationSeconds)}</strong></div>
                <div className="metric"><span>限时</span><strong className="text-lg">{selected.moveTimeLimitSeconds ? `${selected.moveTimeLimitSeconds}s` : '不限'}</strong></div>
              </div>

              <Board
                board={replayBoard}
                nextColor={nextColor}
                moves={replayMoves}
                winningLine={replayResult.line}
                readOnly
              />

              {/* Toolbar */}
              <div className="replay-toolbar mt-5">
                <button className="secondary-button" onClick={() => setStep(0)} disabled={replayIndex === 0}>
                  <ChevronsLeft size={16} />开头
                </button>
                <button className="secondary-button" onClick={() => setStep(replayIndex - 1)} disabled={replayIndex === 0}>
                  <SkipBack size={16} />上一步
                </button>
                <div className="replay-progress" aria-hidden="true">
                  <span style={{ width: `${selected.moves.length ? (replayIndex / selected.moves.length) * 100 : 0}%` }} />
                </div>
                <button className="secondary-button" onClick={() => setStep(replayIndex + 1, true)} disabled={replayIndex === selected.moves.length}>
                  <SkipForward size={16} />下一步
                </button>
                <button className="secondary-button" onClick={() => setStep(selected.moves.length, true)} disabled={replayIndex === selected.moves.length}>
                  <ChevronsRight size={16} />末尾
                </button>
              </div>

              {/* Move notation */}
              <p className="mt-4 max-h-32 overflow-auto rounded-xl p-4 font-mono text-sm leading-7 text-slate-700"
                style={{
                  background: 'linear-gradient(175deg, rgba(255,255,255,.6) 0%, rgba(255,255,255,.4) 100%)',
                }}
              >
                {serializeMoves(selected.moves)}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <BookOpen size={40} className="mb-4 opacity-30" />
              <p>选择左侧棋局查看复盘</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
