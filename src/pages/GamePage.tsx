import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Clock3, RotateCcw, Save, ShieldAlert, Sparkles, Undo2 } from 'lucide-react';
import { Board } from '../components/Board';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';
import { chooseAiMove } from '../lib/ai';
import { applyMove, CENTER, createBoard, detectForbidden, evaluateTerminal, opponent, serializeMoves } from '../lib/board';
import { isInBlackThreeZone, OPENINGS } from '../lib/openings';
import { saveGameRecord } from '../lib/supabase';
import type { Cell, GamePhase, GameRecord, Move, OpeningMode, PlayerMode, Point, Stone, WinResult } from '../types';

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60).toString().padStart(2, '0');
  const sec = (seconds % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

export function GamePage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<Cell[][]>(() => createBoard());
  const [moves, setMoves] = useState<Move[]>([]);
  const [mode, setMode] = useState<OpeningMode>('standard');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('ai');
  const [openingId, setOpeningId] = useState(OPENINGS[0].id);
  const [nextColor, setNextColor] = useState<Stone>('black');
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [result, setResult] = useState<WinResult>({ winner: null, line: [] });
  const [message, setMessage] = useState('黑方先行。指定开局模式下黑 1 必须落天元。');
  const [blackSeconds, setBlackSeconds] = useState(0);
  const [whiteSeconds, setWhiteSeconds] = useState(0);
  const [nCount, setNCount] = useState(3);
  const [nCandidates, setNCandidates] = useState<Point[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const timerRef = useRef<number | null>(null);

  const opening = useMemo(() => OPENINGS.find((item) => item.id === openingId) || OPENINGS[0], [openingId]);
  const isAiTurn = playerMode === 'ai' && nextColor === 'white' && phase === 'playing' && !result.reason;

  const reset = () => {
    setBoard(createBoard());
    setMoves([]);
    setNextColor('black');
    setPhase('playing');
    setResult({ winner: null, line: [] });
    setMessage(mode === 'standard' ? '黑方先行。指定开局模式下黑 1 必须落天元。' : '自由开局已开始。');
    setBlackSeconds(0);
    setWhiteSeconds(0);
    setNCandidates([]);
    setAiThinking(false);
  };

  useEffect(() => {
    reset();
  }, [mode, openingId, playerMode]);

  useEffect(() => {
    if (phase === 'finished') return;
    timerRef.current = window.setInterval(() => {
      if (nextColor === 'black') setBlackSeconds((value) => value + 1);
      else setWhiteSeconds((value) => value + 1);
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [nextColor, phase]);

  const finishIfNeeded = (nextBoard: Cell[][], move: Move): boolean => {
    const terminal = evaluateTerminal(nextBoard, move);
    if (terminal.reason) {
      setResult(terminal);
      setPhase('finished');
      setMessage(
        terminal.winner
          ? `${terminal.winner === 'black' ? '黑方' : '白方'}胜：${terminal.forbidden?.reason || terminal.reason}`
          : '棋盘已满，平局。',
      );
      return true;
    }
    return false;
  };

  const commitMove = (point: Point, color: Stone, aiScore?: number) => {
    const nextBoard = applyMove(board, point, color);
    const forbidden = color === 'black' ? detectForbidden(nextBoard, point) : undefined;
    const move: Move = { ...point, color, index: moves.length + 1, forbidden, aiScore };
    setBoard(nextBoard);
    setMoves((value) => [...value, move]);
    if (!finishIfNeeded(nextBoard, move)) {
      const after = opponent(color);
      setNextColor(after);
      if (mode === 'standard' && move.index === 3) {
        setPhase('swap-offer');
        setMessage('黑 3 已完成。白方可选择三手交换，或继续由白方落第 4 手。');
      } else if (mode === 'standard' && move.index === 4) {
        setMessage(`进入五手 N 打准备。黑方需要放置 ${nCount} 个候选黑 5。`);
      } else {
        setMessage(`${after === 'black' ? '黑方' : '白方'}行棋。`);
      }
    }
  };

  const validateMove = (point: Point): string | null => {
    if (board[point.row][point.col]) return '该交叉点已有棋子。';
    if (mode !== 'standard') return null;
    if (moves.length === 0 && (point.row !== CENTER.row || point.col !== CENTER.col)) return '黑 1 必须落在天元。';
    if (moves.length === 1 && (point.row !== opening.white2.row || point.col !== opening.white2.col)) return `白 2 按 ${opening.name} 应落在指定点。`;
    if (moves.length === 2 && !isInBlackThreeZone(point.row, point.col)) return '黑 3 必须落在天元为中心的 5×5 区域内。';
    if (moves.length === 2 && (point.row !== opening.black3.row || point.col !== opening.black3.col)) return `当前选择 ${opening.name}，黑 3 应落在指定点。`;
    return null;
  };

  const place = (point: Point) => {
    if (phase === 'finished' || isAiTurn || aiThinking) return;
    if (phase === 'swap-offer') {
      setMessage('请先选择是否执行三手交换。');
      return;
    }
    if (mode === 'standard' && moves.length === 4 && nextColor === 'black') {
      if (board[point.row][point.col]) return;
      const exists = nCandidates.some((item) => item.row === point.row && item.col === point.col);
      const nextCandidates = exists ? nCandidates : [...nCandidates, point].slice(0, nCount);
      setNCandidates(nextCandidates);
      setPhase('n-move');
      if (nextCandidates.length >= nCount) {
        setNextColor('white');
        setMessage(`黑 5 的 ${nCount} 个候选点已放置完毕。白方点击其中一个作为正式黑 5。`);
      } else {
        setMessage(`已选择 ${nextCandidates.length} / ${nCount} 个黑 5 候选点。`);
      }
      return;
    }
    if (phase === 'n-move' && nextColor === 'white') {
      const selected = nCandidates.find((item) => item.row === point.row && item.col === point.col);
      if (!selected) {
        setMessage('白方只能从黑 5 候选点中保留一个。');
        return;
      }
      setNCandidates([]);
      setPhase('playing');
      commitMove(selected, 'black');
      return;
    }
    const error = validateMove(point);
    if (error) {
      setMessage(error);
      return;
    }
    commitMove(point, nextColor);
  };

  useEffect(() => {
    if (!isAiTurn) return;
    setAiThinking(true);
    const id = window.setTimeout(() => {
      const ai = chooseAiMove(board, 'white', { maxDepth: 5, timeLimitMs: 2400, mctsPlayouts: 220 });
      commitMove(ai, 'white', ai.score);
      setAiThinking(false);
    }, 240);
    return () => window.clearTimeout(id);
  }, [isAiTurn, board]);

  const swapSides = () => {
    const swapped = moves.map((move) => ({ ...move, color: opponent(move.color) }));
    const nextBoard = createBoard();
    swapped.forEach((move) => {
      nextBoard[move.row][move.col] = move.color;
    });
    setMoves(swapped);
    setBoard(nextBoard);
    setNextColor('white');
    setPhase('playing');
    setMessage('已完成三手交换，双方颜色互换。现在由白方落第 4 手。');
  };

  const undo = () => {
    if (moves.length === 0 || aiThinking) return;
    const removeCount = playerMode === 'ai' && moves.length >= 2 ? 2 : 1;
    const kept = moves.slice(0, Math.max(0, moves.length - removeCount));
    const nextBoard = createBoard();
    kept.forEach((move) => {
      nextBoard[move.row][move.col] = move.color;
    });
    setMoves(kept);
    setBoard(nextBoard);
    setNextColor(kept.length ? opponent(kept[kept.length - 1].color) : 'black');
    setPhase('playing');
    setResult({ winner: null, line: [] });
    setMessage('已悔棋。');
  };

  const save = async () => {
    const record: GameRecord = {
      id: crypto.randomUUID(),
      userId: user?.id,
      userEmail: user?.email,
      mode,
      playerMode,
      openingName: mode === 'standard' ? opening.name : undefined,
      winner: result.winner || (result.reason === 'draw' ? 'draw' : undefined),
      reason: result.forbidden?.reason || result.reason,
      moves,
      createdAt: new Date().toISOString(),
      durationSeconds: blackSeconds + whiteSeconds,
    };
    await saveGameRecord(record);
    setMessage('棋谱已保存。');
  };

  return (
    <section className="animate-panel-in">
      <ConfigNotice />
      <div className="mb-6 grid grid-cols-[1fr_360px] gap-6 max-lg:grid-cols-1">
        <div className="panel p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-semibold">专业五子棋对弈</h1>
              <p className="mt-1 text-sm text-slate-600">15×15 标准棋盘，支持禁手、指定开局、三手交换和五手 N 打。</p>
            </div>
            <div className="flex gap-2">
              <button className="secondary-button" onClick={undo}><Undo2 size={17} />悔棋</button>
              <button className="secondary-button" onClick={reset}><RotateCcw size={17} />重开</button>
              <button className="primary-button" onClick={save}><Save size={17} />保存</button>
            </div>
          </div>
          <Board board={board} nextColor={nextColor} moves={moves} winningLine={result.line} disabled={phase === 'finished'} onPlace={place} />
        </div>
        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="section-title"><Sparkles size={18} />对局设置</h2>
            <div className="segmented">
              <button className={mode === 'standard' ? 'active' : ''} onClick={() => setMode('standard')}>指定开局</button>
              <button className={mode === 'free' ? 'active' : ''} onClick={() => setMode('free')}>自由开局</button>
            </div>
            <div className="segmented mt-3">
              <button className={playerMode === 'ai' ? 'active' : ''} onClick={() => setPlayerMode('ai')}>人机对弈</button>
              <button className={playerMode === 'local' ? 'active' : ''} onClick={() => setPlayerMode('local')}>本地双人</button>
            </div>
            {mode === 'standard' && (
              <>
                <label className="mt-4 block text-sm font-medium text-slate-700">指定开局</label>
                <select className="field mt-2" value={openingId} onChange={(event) => setOpeningId(event.target.value)}>
                  {OPENINGS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <label className="mt-4 block text-sm font-medium text-slate-700">五手 N 打数量</label>
                <input className="field mt-2" type="number" min={2} max={5} value={nCount} onChange={(event) => setNCount(Number(event.target.value))} />
              </>
            )}
          </div>
          <div className="panel p-5">
            <h2 className="section-title"><Clock3 size={18} />对局状态</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="metric"><span>黑方</span><strong>{formatTime(blackSeconds)}</strong></div>
              <div className="metric"><span>白方</span><strong>{formatTime(whiteSeconds)}</strong></div>
            </div>
            <div className="mt-4 rounded-lg bg-slate-950 p-4 text-amber-100 shadow-stone">
              <p className="text-sm">{message}</p>
              {aiThinking && <p className="mt-2 flex items-center gap-2 text-xs text-amber-200"><Bot size={14} />AI 正在进行定式匹配、威胁搜索、极大极小与 MCTS 推演</p>}
            </div>
            {phase === 'swap-offer' && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="primary-button justify-center" onClick={swapSides}>执行交换</button>
                <button className="secondary-button justify-center" onClick={() => { setPhase('playing'); setNextColor('white'); }}>继续白 4</button>
              </div>
            )}
            {phase === 'n-move' && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm">
                <p>黑 5 候选点：{nCandidates.map((p) => `(${p.row + 1},${p.col + 1})`).join('、') || '待选择'}</p>
                <p className="mt-1 text-slate-500">选满后由白方点击要保留的候选点。</p>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <ShieldAlert size={16} />
              黑棋禁手实时判定，白棋无禁手。
            </div>
            <div className="mt-3 rounded-lg bg-white/70 p-3 text-xs leading-6 text-slate-600">
              AI 引擎：开局定式库、禁手过滤、必杀/防杀优先、多层 Alpha-Beta、威胁空间评分、MCTS 采样校验。
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="section-title">棋谱</h2>
            <p className="mt-3 max-h-36 overflow-auto rounded-lg bg-white/60 p-3 font-mono text-xs leading-6 text-slate-700">
              {moves.length ? serializeMoves(moves) : '暂无落子'}
            </p>
          </div>
        </aside>
      </div>
    </section>
  );
}
