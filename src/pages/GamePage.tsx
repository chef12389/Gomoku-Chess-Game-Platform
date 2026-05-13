import { useEffect, useMemo, useRef, useState } from 'react';
import { Swords, BarChart3, BookOpen, Crown, Bell, Bot, Clock3, HelpCircle, LogOut, MessageCircle, Music, Play, RotateCcw, Send, ShieldAlert, Sparkles, Undo2, Users, Volume2, VolumeX, Wifi } from 'lucide-react';
import { Board } from '../components/Board';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';
import { chooseAiMove } from '../lib/ai';
import { applyMove, CENTER, createBoard, detectForbidden, evaluateTerminal, opponent, serializeMoves } from '../lib/board';
import {
  createNMoveCandidates,
  isBadOpening,
  isInBlackThreeZone,
  OPENINGS,
  recommendNForOpponent,
  recommendNForSide,
  selectAiOpening,
  selectBalancedOpening,
  shouldSwapOpening,
} from '../lib/openings';
import { createOnlineRoom, fetchOnlineRoom, isSupabaseConfigured, joinOnlineRoom, saveGameRecord, sendOnlineRoomMessage, updateOnlineRoomMove } from '../lib/supabase';
import { playSound } from '../lib/sound';
import type { Cell, GamePhase, GameRecord, Move, OnlineRoom, OpeningDefinition, OpeningMode, PlayerMode, Point, Stone, WinResult } from '../types';

const CUSTOM_OPENING_ID = 'custom-opening';

type Screen = 'home' | 'setup' | 'board';
type OpponentStrength = 'normal' | 'strong';
type AiDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'professional';

const AI_DIFFICULTY_OPTIONS: Array<{ id: AiDifficulty; label: string; depth: number }> = [
  { id: 'beginner', label: '初级', depth: 2 },
  { id: 'intermediate', label: '中级', depth: 4 },
  { id: 'advanced', label: '高级', depth: 6 },
  { id: 'professional', label: '专业', depth: 8 },
];
const MOVE_TIME_LIMIT_OPTIONS = [0, 15, 30, 60, 120];
const soundStorageKey = 'renju.sound.enabled';
const musicStorageKey = 'renju.music.enabled';
const backgroundMusicPath = `${import.meta.env.BASE_URL}music/background.ogg`;

const colorText = (color: Stone) => (color === 'black' ? '黑方' : '白方');
const colorShort = (color: Stone) => (color === 'black' ? '黑' : '白');
const BOARD_FILES = 'ABCDEFGHIJKLMNO'.split('');

function formatBoardPoint(point: Point) {
  return `${BOARD_FILES[point.col]}${point.row + 1}`;
}

function formatBoardPoints(points: Point[]) {
  return points.map(formatBoardPoint).join('、') || '待选择';
}

function makeRecordId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function formatTime(seconds: number) {
  const min = Math.floor(seconds / 60).toString().padStart(2, '0');
  const sec = (seconds % 60).toString().padStart(2, '0');
  return `${min}:${sec}`;
}

function distance(a: Point, b: Point) {
  return Math.max(Math.abs(a.row - b.row), Math.abs(a.col - b.col));
}

function makeMove(point: Point, color: Stone, index: number, boardAfter: Cell[][], aiScore?: number): Move {
  const forbidden = color === 'black' ? detectForbidden(boardAfter, point) : undefined;
  return { ...point, color, index, forbidden, aiScore };
}

function applyOpening(opening: OpeningDefinition) {
  let nextBoard = createBoard();
  const rawMoves = [
    { ...opening.black1, color: 'black' as Stone },
    { ...opening.white2, color: 'white' as Stone },
    { ...opening.black3, color: 'black' as Stone },
  ];
  const moves: Move[] = [];
  rawMoves.forEach((item, index) => {
    nextBoard = applyMove(nextBoard, item, item.color);
    moves.push(makeMove(item, item.color, index + 1, nextBoard));
  });
  return { board: nextBoard, moves };
}

export function GamePage() {
  const { user } = useAuth();
  const [screen, setScreen] = useState<Screen>('home');
  const [board, setBoard] = useState<Cell[][]>(() => createBoard());
  const [moves, setMoves] = useState<Move[]>([]);
  const [mode, setMode] = useState<OpeningMode>('standard');
  const [playerMode, setPlayerMode] = useState<PlayerMode>('ai');
  const [humanSide, setHumanSide] = useState<Stone>('black');
  const [onlineRoom, setOnlineRoom] = useState<OnlineRoom | null>(null);
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [onlineError, setOnlineError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [opponentStrength, setOpponentStrength] = useState<OpponentStrength>('normal');
  const [aiDifficulty, setAiDifficulty] = useState<AiDifficulty>('advanced');
  const [openingId, setOpeningId] = useState(selectBalancedOpening().id);
  const [activeOpeningId, setActiveOpeningId] = useState(selectBalancedOpening().id);
  const [nextColor, setNextColor] = useState<Stone>('black');
  const [phase, setPhase] = useState<GamePhase>('playing');
  const [result, setResult] = useState<WinResult>({ winner: null, line: [] });
  const [message, setMessage] = useState('请选择对局模式和规则后开始。');
  const [blackSeconds, setBlackSeconds] = useState(0);
  const [whiteSeconds, setWhiteSeconds] = useState(0);
  const [currentTurnSeconds, setCurrentTurnSeconds] = useState(0);
  const [moveTimeLimitSeconds, setMoveTimeLimitSeconds] = useState(0);
  const [turnAlerted, setTurnAlerted] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(soundStorageKey) !== 'false';
  });
  const [musicEnabled, setMusicEnabled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(musicStorageKey) === 'true';
  });
  const [showRuleHelp, setShowRuleHelp] = useState(false);
  const [nCount, setNCount] = useState(3);
  const [nCandidates, setNCandidates] = useState<Point[]>([]);
  const [aiThinking, setAiThinking] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const timerRef = useRef<number | null>(null);
  const progressRef = useRef<number | null>(null);
  const aiWorkerRef = useRef<Worker | null>(null);
  const aiJobIdRef = useRef(0);
  const aiFallbackTimerRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const autoSavedRecordKeyRef = useRef<string | null>(null);

  const isCustomOpening = activeOpeningId === CUSTOM_OPENING_ID;
  const opening = useMemo(() => OPENINGS.find((item) => item.id === activeOpeningId) || selectBalancedOpening(), [activeOpeningId]);
  const openingName = mode === 'standard' ? (isCustomOpening ? '自定义开局' : opening.name) : undefined;
  const aiSide: Stone = humanSide === 'black' ? 'white' : 'black';
  const aiDifficultyConfig = AI_DIFFICULTY_OPTIONS.find((item) => item.id === aiDifficulty) || AI_DIFFICULTY_OPTIONS[2];
  const whiteControlledByHuman = playerMode === 'local' || humanSide === 'white';
  const onlineMyColor: Stone = onlineRoom ? (onlineRoom.host_color === humanSide ? onlineRoom.host_color : humanSide) : humanSide;
  const isOnlineMyTurn = playerMode === 'online' && nextColor === onlineMyColor && onlineRoom?.status !== 'waiting';
  const customOpeningInProgress = mode === 'standard' && isCustomOpening && moves.length < 3;
  const isAiTurn = screen === 'board' && playerMode === 'ai' && phase === 'playing' && !result.reason && nextColor === aiSide && !customOpeningInProgress;
  const onlineChatMessages = onlineRoom?.chat_messages || [];

  // ---- All useEffect hooks (unchanged logic) ----
  useEffect(() => {
    aiWorkerRef.current = new Worker(new URL('../lib/aiWorker.ts', import.meta.url), { type: 'module' });
    return () => {
      if (aiFallbackTimerRef.current) window.clearTimeout(aiFallbackTimerRef.current);
      if (progressRef.current) window.clearInterval(progressRef.current);
      aiWorkerRef.current?.terminate();
      aiWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!aiThinking) {
      if (progressRef.current) window.clearInterval(progressRef.current);
      progressRef.current = null;
      setAiProgress(0);
      return undefined;
    }
    setAiProgress(8);
    progressRef.current = window.setInterval(() => {
      setAiProgress((value) => Math.min(95, value + Math.max(1, Math.round((96 - value) * 0.08))));
    }, 260);
    return () => {
      if (progressRef.current) window.clearInterval(progressRef.current);
      progressRef.current = null;
    };
  }, [aiThinking]);

  useEffect(() => {
    if (screen !== 'board' || phase === 'finished') return undefined;
    timerRef.current = window.setInterval(() => {
      if (nextColor === 'black') setBlackSeconds((value) => value + 1);
      else setWhiteSeconds((value) => value + 1);
      setCurrentTurnSeconds((value) => value + 1);
    }, 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [screen, nextColor, phase]);

  useEffect(() => {
    localStorage.setItem(soundStorageKey, soundEnabled ? 'true' : 'false');
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem(musicStorageKey, musicEnabled ? 'true' : 'false');
    if (!musicRef.current) {
      musicRef.current = new Audio(backgroundMusicPath);
      musicRef.current.loop = true;
      musicRef.current.volume = 0.35;
    }
    const music = musicRef.current;
    if (musicEnabled) {
      void music.play().catch(() => {
        setMusicEnabled(false);
        setMessage('未找到或无法播放背景音乐，请检查背景音乐文件后再开启。');
      });
    } else {
      music.pause();
    }
  }, [musicEnabled]);

  useEffect(() => {
    setCurrentTurnSeconds(0);
    setTurnAlerted(false);
  }, [nextColor, moves.length, screen]);

  useEffect(() => {
    if (screen !== 'board' || phase === 'finished' || !moveTimeLimitSeconds || turnAlerted) return;
    if (currentTurnSeconds < moveTimeLimitSeconds) return;
    setTurnAlerted(true);
    playSound('alert', soundEnabled);
    setMessage(`${colorText(nextColor)}本手已超过 ${moveTimeLimitSeconds} 秒，请尽快落子。`);
  }, [currentTurnSeconds, moveTimeLimitSeconds, nextColor, phase, screen, soundEnabled, turnAlerted]);

  useEffect(() => {
    if (playerMode !== 'online' || !onlineRoom) return undefined;
    const id = window.setInterval(async () => {
      const latest = await fetchOnlineRoom(onlineRoom.id).catch(() => null);
      if (!latest) return;
      setOnlineRoom(latest);
      setBoard(latest.board);
      setMoves(latest.moves);
      setNextColor(latest.next_color);
      if (latest.winner) {
        setPhase('finished');
        setMessage(`在线对局结束：${latest.winner === 'draw' ? '平局' : `${colorText(latest.winner)}获胜`}`);
      } else if (latest.status === 'waiting') {
        setMessage(`房间号：${latest.code}。等待对手加入。`);
      } else {
        setMessage(`在线对局中，当前由${colorText(latest.next_color)}行棋。`);
      }
    }, 1200);
    return () => window.clearInterval(id);
  }, [playerMode, onlineRoom?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' });
  }, [onlineChatMessages.length]);

  const pendingUndoRequest = useMemo(() => {
    if (!onlineRoom) return null;
    const answered = new Set(
      onlineChatMessages
        .filter((item) => (item.kind === 'undo-accepted' || item.kind === 'undo-rejected') && item.undo_request_id)
        .map((item) => item.undo_request_id),
    );
    return [...onlineChatMessages]
      .reverse()
      .find((item) => item.kind === 'undo-request' && item.undo_request_id && !answered.has(item.undo_request_id) && item.sender_color !== onlineMyColor) || null;
  }, [onlineChatMessages, onlineMyColor, onlineRoom]);

  const rebuildBoardFromMoves = (targetMoves: Move[]) => {
    const nextBoard = createBoard();
    targetMoves.forEach((move) => {
      nextBoard[move.row][move.col] = move.color;
    });
    return nextBoard;
  };

  const resetBoard = () => {
    setBoard(createBoard());
    setMoves([]);
    setNextColor('black');
    setPhase('playing');
    setResult({ winner: null, line: [] });
    setBlackSeconds(0);
    setWhiteSeconds(0);
    setCurrentTurnSeconds(0);
    setTurnAlerted(false);
    setNCandidates([]);
    setAiThinking(false);
    setAiProgress(0);
    autoSavedRecordKeyRef.current = null;
  };

  const chooseMode = (targetMode: PlayerMode) => {
    setPlayerMode(targetMode);
    setOnlineError('');
    setScreen('setup');
  };

  const startGame = () => {
    resetBoard();
    setScreen('board');

    if (mode !== 'standard') {
      setActiveOpeningId(selectBalancedOpening().id);
      setNCount(recommendNForSide(humanSide));
      setMessage('自由开局已开始。黑方先行。');
      return;
    }

    if (openingId === CUSTOM_OPENING_ID && !(playerMode === 'ai' && humanSide === 'white')) {
      setActiveOpeningId(CUSTOM_OPENING_ID);
      setNCount(recommendNForSide(humanSide));
      setMessage('自定义开局：请依次落黑 1、白 2、黑 3，之后白方决定是否三手交换。');
      return;
    }

    const chosenOpening = playerMode === 'ai' && humanSide === 'white'
      ? selectAiOpening()
      : OPENINGS.find((item) => item.id === openingId) || selectBalancedOpening();
    const prepared = applyOpening(chosenOpening);
    setActiveOpeningId(chosenOpening.id);
    setBoard(prepared.board);
    setMoves(prepared.moves);
    setNextColor('white');
    setPhase('swap-offer');
    setNCount(recommendNForSide(humanSide));
    setMessage(
      playerMode === 'ai' && humanSide === 'white'
        ? `AI 选择了${chosenOpening.name}并摆好前三手。你现在决定是否三手交换。`
        : `${chosenOpening.name}前三手已自动摆好。白方现在决定是否三手交换。`,
    );
  };

  const createRoom = async () => {
    setOnlineError('');
    try {
      const room = await createOnlineRoom(user?.id, user?.email, humanSide);
      setOnlineRoom(room);
      resetBoard();
      setScreen('board');
      setMessage(`在线房间已创建，房间号：${room.code}。等待对手加入。`);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : '创建房间失败。');
    }
  };

  const joinRoom = async () => {
    setOnlineError('');
    try {
      const room = await joinOnlineRoom(roomCodeInput, user?.id, user?.email);
      setOnlineRoom(room);
      setHumanSide(opponent(room.host_color));
      setBoard(room.board);
      setMoves(room.moves);
      setNextColor(room.next_color);
      setScreen('board');
      setMessage(`已加入房间 ${room.code}，当前由${colorText(room.next_color)}行棋。`);
    } catch (err) {
      setOnlineError(err instanceof Error ? err.message : '加入房间失败。');
    }
  };

  const submitChat = async () => {
    const text = chatInput.trim();
    if (!onlineRoom || !text || chatSending) return;
    setChatSending(true);
    setChatError('');
    try {
      const chatMessages = await sendOnlineRoomMessage(onlineRoom.id, {
        sender_id: user?.id && user.id !== 'local-admin' ? user.id : null,
        sender_email: user?.email || '访客',
        sender_color: onlineMyColor,
        text,
      });
      setOnlineRoom((room) => (room ? { ...room, chat_messages: chatMessages } : room));
      setChatInput('');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '消息发送失败。');
    } finally {
      setChatSending(false);
    }
  };

  const leaveOnlineRoom = async () => {
    if (!onlineRoom) return;
    const leaver = user?.email || '访客';
    setChatError('');
    try {
      await sendOnlineRoomMessage(onlineRoom.id, {
        sender_id: user?.id && user.id !== 'local-admin' ? user.id : null,
        sender_email: '系统通知',
        sender_color: onlineMyColor,
        text: `${leaver} 已离开房间。`,
      });
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '离开通知发送失败。');
    } finally {
      setOnlineRoom(null);
      setChatInput('');
      setScreen('setup');
      setMessage('已离开在线房间。');
      resetBoard();
    }
  };

  const suggestedPoints = useMemo(() => {
    if (mode !== 'standard' || phase === 'finished') return [];
    if (phase === 'n-move') return nCandidates.map((point) => ({ ...point, label: formatBoardPoint(point), color: 'black' as Stone }));
    if (!isCustomOpening || moves.length >= 3) return [];
    if (moves.length === 0) return [{ ...CENTER, label: '黑1', color: 'black' as Stone }];
    return [];
  }, [mode, phase, nCandidates, isCustomOpening, moves.length]);

  const finishIfNeeded = (nextBoard: Cell[][], move: Move): boolean => {
    const terminal = evaluateTerminal(nextBoard, move);
    if (!terminal.reason) return false;
    setResult(terminal);
    setPhase('finished');
    playSound('win', soundEnabled);
    setMessage(terminal.winner ? `${colorText(terminal.winner)}获胜：${terminal.forbidden?.reason || terminal.reason}` : '棋盘已满，平局。');
    return true;
  };

  const commitMove = (point: Point, color: Stone, aiScore?: number) => {
    const nextBoard = applyMove(board, point, color);
    const move = makeMove(point, color, moves.length + 1, nextBoard, aiScore);
    setBoard(nextBoard);
    setMoves((value) => [...value, move]);
    playSound('place', soundEnabled);
    if (finishIfNeeded(nextBoard, move)) return;

    const after = opponent(color);
    setNextColor(after);
    if (mode === 'standard' && move.index === 3) {
      setPhase('swap-offer');
      setMessage('前三手已完成，白方拥有三手交换权。');
    } else if (mode === 'standard' && move.index === 4) {
      setPhase('n-move');
      setMessage(`黑方请选择 ${nCount} 个候选点。`);
    } else {
      setMessage(`${colorText(after)}行棋。`);
    }
  };

  const validateMove = (point: Point): string | null => {
    if (board[point.row][point.col]) return '该交叉点已有棋子。';
    if (mode !== 'standard' || moves.length >= 3) return null;
    if (!isCustomOpening) return '指定开局已自动摆前三手，不需要手动落子。';
    if (moves.length === 0 && (point.row !== CENTER.row || point.col !== CENTER.col)) return '自定义开局中黑 1 必须落天元。';
    if (moves.length === 2 && !isInBlackThreeZone(point.row, point.col)) return '自定义开局中黑 3 必须在天元 5x5 区域内。';
    return null;
  };

  const scoreBlackFiveForBlack = (point: Point) => {
    const blackStones = moves.filter((move) => move.color === 'black');
    const whiteStones = moves.filter((move) => move.color === 'white');
    const centerPenalty = Math.abs(point.row - CENTER.row) + Math.abs(point.col - CENTER.col);
    const edgePenalty = Math.min(point.row, point.col, 14 - point.row, 14 - point.col);
    const nearestBlack = blackStones.reduce((best, stone) => Math.min(best, distance(point, stone)), 99);
    const closeBlack = blackStones.filter((stone) => distance(point, stone) <= 2).length;
    const closeWhite = whiteStones.filter((stone) => distance(point, stone) <= 2).length;
    let score = 0;
    score += (14 - centerPenalty) * 18;
    score += edgePenalty * 40;
    score += Math.max(0, 5 - nearestBlack) * 80;
    score += closeBlack * 120;
    score -= closeWhite * 40;
    if (point.row === 0 || point.row === 14 || point.col === 0 || point.col === 14) score -= 260;
    if ((point.row === 0 || point.row === 14) && (point.col === 0 || point.col === 14)) score -= 360;
    return score;
  };

  const chooseWeakestBlackFive = (candidates: Point[]) => [...candidates].sort((a, b) => scoreBlackFiveForBlack(a) - scoreBlackFiveForBlack(b))[0] || candidates[0];

  const chooseStrongWhiteFourth = (): Point => {
    const strongByOpening: Record<string, Point[]> = {
      '直指 疏星': [{ row: 5, col: 8 }, { row: 6, col: 9 }],
      '直指 瑞星': [{ row: 5, col: 8 }, { row: 6, col: 9 }],
      '直指 丘月': [{ row: 5, col: 8 }, { row: 6, col: 7 }],
    };
    const candidates = [...(openingName ? strongByOpening[openingName] || [] : []), ...createNMoveCandidates(board, 5)];
    return candidates.find((point) => !board[point.row][point.col]) || chooseAiMove(board, 'white', { maxDepth: 2, timeLimitMs: 300 });
  };

  const place = (point: Point) => {
    if (phase === 'finished' || aiThinking) return;
    if (playerMode === 'online' && !isOnlineMyTurn) {
      setMessage('在线对局中，请等待对手行棋。');
      return;
    }
    if (playerMode === 'ai' && nextColor === aiSide && !customOpeningInProgress) return;
    if (phase === 'swap-offer') {
      setMessage('请先处理三手交换。');
      return;
    }
    if (mode === 'standard' && (phase === 'playing' || phase === 'n-move') && moves.length === 4 && nextColor === 'black') {
      if (board[point.row][point.col]) return;
      const exists = nCandidates.some((item) => item.row === point.row && item.col === point.col);
      const nextCandidates = exists ? nCandidates : [...nCandidates, point].slice(0, nCount);
      setNCandidates(nextCandidates);
      setPhase('n-move');
      if (nextCandidates.length >= nCount) {
        setNextColor('white');
        setMessage(`黑 5 候选点已放置完毕：${formatBoardPoints(nextCandidates)}。白方请选择保留点。`);
      } else {
        setNextColor('black');
        setMessage(`已选择 ${nextCandidates.length} / ${nCount} 个黑 5 候选点：${formatBoardPoints(nextCandidates)}。`);
      }
      return;
    }
    if (phase === 'n-move' && nextColor === 'white') {
      const selected = nCandidates.find((item) => item.row === point.row && item.col === point.col);
      if (!selected) {
        setMessage(`白方只能从棋盘上标出的黑 5 候选点中保留一个：${formatBoardPoints(nCandidates)}。`);
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

    if (playerMode === 'online' && onlineRoom) {
      const nextBoard = applyMove(board, point, nextColor);
      const move = makeMove(point, nextColor, moves.length + 1, nextBoard);
      const terminal = evaluateTerminal(nextBoard, move);
      const nextMoves = [...moves, move];
      const winner = terminal.winner || (terminal.reason === 'draw' ? 'draw' : null);
      setBoard(nextBoard);
      setMoves(nextMoves);
      playSound('place', soundEnabled);
      setNextColor(opponent(nextColor));
      if (terminal.reason) {
        setResult(terminal);
        setPhase('finished');
        playSound('win', soundEnabled);
        setMessage(winner === 'draw' ? '在线对局结束：平局。' : `在线对局结束：${terminal.winner ? colorText(terminal.winner) : ''}获胜。`);
      }
      void updateOnlineRoomMove(onlineRoom, nextBoard, nextMoves, opponent(nextColor), winner);
      return;
    }

    commitMove(point, nextColor);
  };

  const continueWithoutSwap = (customMessage = '白方不交换，继续由白方落第 4 手。') => {
    setAiThinking(false);
    setNextColor('white');
    setPhase('playing');
    setMessage(customMessage);
  };

  const swapSides = (customMessage = '已完成三手交换，双方交换后继续执棋。现在由白方落第 4 手。') => {
    setAiThinking(false);
    if (playerMode === 'ai') setHumanSide((side) => opponent(side));
    setNCount(recommendNForSide(opponent(humanSide)));
    setNextColor('white');
    setPhase('playing');
    setMessage(customMessage);
  };

  useEffect(() => {
    if (screen !== 'board' || playerMode !== 'ai' || result.reason) return undefined;

    if (phase === 'swap-offer' && nextColor === 'white' && aiSide === 'white' && humanSide === 'black') {
      const shouldSwap = openingName ? shouldSwapOpening(openingName) : false;
      const id = window.setTimeout(() => {
        setAiThinking(false);
        if (shouldSwap) {
          swapSides('AI 判断这是黑方大优或必胜开局，已执行三手交换。');
        } else {
          setPhase('playing');
          const point = chooseStrongWhiteFourth();
          commitMove(point, 'white');
          setMessage(`AI 判断不交换，并已落下白 4。黑方请选择 ${nCount} 个候选点。`);
        }
      }, 450);
      return () => window.clearTimeout(id);
    }

    if (mode === 'standard' && (phase === 'playing' || phase === 'n-move') && nextColor === 'black' && aiSide === 'black' && moves.length === 4) {
      const id = window.setTimeout(() => {
        const candidates = createNMoveCandidates(board, nCount).slice(0, nCount);
        setNCandidates(candidates);
        setPhase('n-move');
        setNextColor('white');
        setAiThinking(false);
        setMessage(`AI 已给出 ${nCount} 个黑 5 候选点：${formatBoardPoints(candidates)}。请白方在棋盘标记中保留一个。`);
      }, 250);
      return () => window.clearTimeout(id);
    }

    if (mode === 'standard' && phase === 'n-move' && nextColor === 'white' && aiSide === 'white' && nCandidates.length >= nCount) {
      const id = window.setTimeout(() => {
        setAiThinking(false);
        const selected = chooseWeakestBlackFive(nCandidates);
        setNCandidates([]);
        setPhase('playing');
        commitMove(selected, 'black');
        setAiThinking(false);
        setMessage('AI 已从 N 打候选中保留最弱、最利于白方的黑 5。');
      }, 450);
      return () => window.clearTimeout(id);
    }

    if (!isAiTurn || aiThinking) return undefined;
    setAiThinking(true);
    const id = window.setTimeout(() => {
      if (mode === 'standard' && moves.length === 3 && aiSide === 'white') {
        const point = chooseStrongWhiteFourth();
        commitMove(point, 'white');
      } else {
        const worker = aiWorkerRef.current;
        if (!worker) {
          const ai = chooseAiMove(board, aiSide, { maxDepth: aiDifficultyConfig.depth, timeLimitMs: 0 });
          commitMove(ai, aiSide, ai.score);
        } else {
          const jobId = aiJobIdRef.current + 1;
          aiJobIdRef.current = jobId;
          if (aiFallbackTimerRef.current) window.clearTimeout(aiFallbackTimerRef.current);
          aiFallbackTimerRef.current = window.setTimeout(() => {
            if (jobId !== aiJobIdRef.current) return;
            worker.terminate();
            aiWorkerRef.current = new Worker(new URL('../lib/aiWorker.ts', import.meta.url), { type: 'module' });
            const ai = chooseAiMove(board, aiSide, { maxDepth: Math.min(4, aiDifficultyConfig.depth), timeLimitMs: 2500 });
            commitMove(ai, aiSide, ai.score);
            setAiThinking(false);
          }, 15000);
          worker.onmessage = (event: MessageEvent<{ id: number; move: Point & { score: number } }>) => {
            if (event.data.id !== aiJobIdRef.current) return;
            if (aiFallbackTimerRef.current) window.clearTimeout(aiFallbackTimerRef.current);
            const ai = event.data.move;
            commitMove(ai, aiSide, ai.score);
            setAiThinking(false);
          };
          worker.onerror = () => {
            if (aiFallbackTimerRef.current) window.clearTimeout(aiFallbackTimerRef.current);
            setMessage('AI 后台计算失败，请重试。');
            setAiThinking(false);
          };
          worker.postMessage({ id: jobId, board, color: aiSide, maxDepth: aiDifficultyConfig.depth });
          return;
        }
      }
      setAiThinking(false);
    }, 300);
    return () => window.clearTimeout(id);
  }, [screen, playerMode, aiSide, aiDifficultyConfig.depth, isAiTurn, phase, nextColor, moves.length, board, nCandidates, nCount, result.reason, openingName, mode]);

  const undo = () => {
    if (moves.length === 0 || aiThinking) return;
    if (playerMode === 'online') {
      void requestOnlineUndo();
      return;
    }
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
    setNCandidates([]);
    setMessage('已悔棋。');
  };

  const requestOnlineUndo = async () => {
    if (!onlineRoom || moves.length === 0 || chatSending) return;
    setChatError('');
    const requestId = `undo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      const chatMessages = await sendOnlineRoomMessage(onlineRoom.id, {
        sender_id: user?.id && user.id !== 'local-admin' ? user.id : null,
        sender_email: user?.email || '访客',
        sender_color: onlineMyColor,
        text: `${onlineMyColor === 'black' ? '黑方' : '白方'}申请悔棋，等待对方同意。`,
        kind: 'undo-request',
        undo_request_id: requestId,
        target_move_count: moves.length,
      });
      setOnlineRoom((room) => (room ? { ...room, chat_messages: chatMessages } : room));
      setMessage('已发送悔棋申请，等待对方同意。');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '悔棋申请发送失败。');
    }
  };

  const respondOnlineUndo = async (accepted: boolean) => {
    if (!onlineRoom || !pendingUndoRequest) return;
    setChatError('');
    try {
      let nextRoom = onlineRoom;
      if (accepted) {
        const targetCount = Math.max(0, (pendingUndoRequest.target_move_count ?? moves.length) - 1);
        const kept = moves.slice(0, targetCount);
        const nextBoard = rebuildBoardFromMoves(kept);
        const nextTurn = kept.length ? opponent(kept[kept.length - 1].color) : 'black';
        await updateOnlineRoomMove(onlineRoom, nextBoard, kept, nextTurn, null);
        setBoard(nextBoard);
        setMoves(kept);
        setNextColor(nextTurn);
        setPhase('playing');
        setResult({ winner: null, line: [] });
        nextRoom = { ...onlineRoom, board: nextBoard, moves: kept, next_color: nextTurn, winner: null, status: 'playing' };
      }
      const chatMessages = await sendOnlineRoomMessage(onlineRoom.id, {
        sender_id: user?.id && user.id !== 'local-admin' ? user.id : null,
        sender_email: user?.email || '访客',
        sender_color: onlineMyColor,
        text: accepted ? '已同意悔棋，棋局已回退一步。' : '已拒绝悔棋申请。',
        kind: accepted ? 'undo-accepted' : 'undo-rejected',
        undo_request_id: pendingUndoRequest.undo_request_id,
      });
      setOnlineRoom({ ...nextRoom, chat_messages: chatMessages });
      setMessage(accepted ? '悔棋已生效，棋局回退一步。' : '已拒绝对方悔棋申请。');
    } catch (err) {
      setChatError(err instanceof Error ? err.message : '处理悔棋申请失败。');
    }
  };

  const buildGameRecord = (): GameRecord | null => {
    if (moves.length === 0) return null;
    return {
      id: makeRecordId(),
      userId: user?.id,
      userEmail: user?.email,
      mode,
      playerMode,
      winner: result.winner || (result.reason === 'draw' ? 'draw' : undefined),
      reason: result.forbidden?.reason || result.reason,
      moves,
      createdAt: new Date().toISOString(),
      durationSeconds: blackSeconds + whiteSeconds,
      moveTimeLimitSeconds: moveTimeLimitSeconds || null,
    };
  };

  useEffect(() => {
    if (phase !== 'finished' || moves.length === 0) return;
    const autoSaveKey = `${moves.length}-${result.reason || 'finished'}-${result.winner || 'draw'}`;
    if (autoSavedRecordKeyRef.current === autoSaveKey) return;
    autoSavedRecordKeyRef.current = autoSaveKey;
    const record = buildGameRecord();
    if (record) void saveGameRecord(record);
  }, [phase, moves, result.reason, result.winner, result.forbidden?.reason, mode, playerMode, user?.id, user?.email, blackSeconds, whiteSeconds]);

  const difficultyControl = (
    <div className="segmented mt-2">
      {AI_DIFFICULTY_OPTIONS.map((item) => (
        <button key={item.id} className={aiDifficulty === item.id ? 'active' : ''} onClick={() => setAiDifficulty(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );

  const statusLabel = result.reason
    ? result.winner
      ? `${colorText(result.winner)}获胜`
      : '平局'
    : aiThinking
      ? 'AI 思考中'
      : playerMode === 'online' && onlineRoom?.status === 'waiting'
        ? '等待对手加入'
        : playerMode === 'online'
          ? isOnlineMyTurn ? '轮到你落子' : '等待对手'
          : phase === 'swap-offer'
            ? '处理交换权'
            : phase === 'n-move'
              ? nextColor === 'black' ? '黑方选择候选点' : '白方保留候选点'
              : `${colorText(nextColor)}行棋`;

  const statusTone = result.reason
    ? 'finished'
    : aiThinking || (playerMode === 'online' && !isOnlineMyTurn)
      ? 'waiting'
      : 'active';

  const ruleHelpItems = [
    '黑棋先行，任一方连成五子即获胜。',
    '黑棋禁手实时判定，白棋不受禁手限制。',
    '指定开局会先完成前三手，白方可选择是否交换。',
    '候选点阶段按棋盘标记选择即可，默认界面不展示长说明。',
  ];

  // ═══════════════════════════════════════════
  // HOME SCREEN
  // ═══════════════════════════════════════════
  if (screen === 'home') {
    return (
      <section className="space-y-8 animate-panel-in pb-8">
        <ConfigNotice />

        {/* Hero Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-white/30 shadow-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(30,27,75,.92) 0%, rgba(45,35,25,.88) 50%, rgba(15,12,8,.94) 100%)',
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 via-amber-600/10 to-indigo-500/20 mix-blend-overlay" />
          <div className="absolute right-0 top-0 h-80 w-80 rounded-full bg-amber-500/8 blur-3xl translate-x-1/3 -translate-y-1/3" />
          <div className="absolute left-1/4 bottom-0 h-64 w-64 rounded-full bg-indigo-500/8 blur-3xl" />

          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center gap-6 p-8 lg:p-10">
            <div className="flex-1">
              <h1 className="font-serif text-4xl lg:text-5xl font-bold tracking-tight text-white mb-3 leading-tight">
                欢迎来到{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-300">
                  星璇连珠
                </span>
              </h1>
            </div>

            {/* User card */}
            <div className="shrink-0 rounded-2xl border border-white/15 bg-white/6 backdrop-blur-md p-5 min-w-[220px]">
              <div className="text-xs font-semibold text-slate-400/90 uppercase tracking-wider mb-3">当前用户</div>
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-sm font-bold text-white shadow-inner">
                  {user?.email ? user.email.charAt(0).toUpperCase() : 'G'}
                </div>
                <div>
                  <div className="font-bold text-white text-lg truncate w-32">
                    {user?.email ? user.email.split('@')[0] : '访客'}
                  </div>
                  <div className="text-xs text-slate-400/80 mt-0.5">
                    {user?.email ? '已认证棋手' : '游客模式'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Game Modes */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-5 flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <Swords size={18} />
            </span>
            选择对局模式
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* AI Mode */}
            <button
              className="home-mode-card group cursor-pointer"
              onClick={() => chooseMode('ai')}
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 ring-1 ring-blue-200/60 mb-5 group-hover:scale-110 transition-transform duration-300">
                <Bot className="text-blue-600" size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">人机训练</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                和内置 AI 对弈，有四档难度调节，实现计算机博弈。
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                开始对弈 <span className="text-lg leading-none">&rarr;</span>
              </div>
            </button>

            {/* Local Mode */}
            <button
              className="home-mode-card group cursor-pointer"
              onClick={() => chooseMode('local')}
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100 ring-1 ring-emerald-200/60 mb-5 group-hover:scale-110 transition-transform duration-300">
                <Users className="text-emerald-600" size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">本地双人</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                同屏对弈，轮流落子。
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                开始对弈 <span className="text-lg leading-none">&rarr;</span>
              </div>
            </button>

            {/* Online Mode */}
            <button
              className="home-mode-card group cursor-pointer"
              onClick={() => chooseMode('online')}
            >
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-gradient-to-br from-amber-50 to-amber-100 ring-1 ring-amber-200/60 mb-5 group-hover:scale-110 transition-transform duration-300">
                <Wifi className="text-amber-600" size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-2">在线对战</h3>
              <p className="text-sm leading-relaxed text-slate-600">
                创建或加入房间，进行实时对弈。
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-semibold text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                开始对弈 <span className="text-lg leading-none">&rarr;</span>
              </div>
            </button>
          </div>
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="glass-chip flex items-center gap-5 p-6 group cursor-pointer">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500 shrink-0 group-hover:bg-amber-100 group-hover:text-amber-600 transition-colors duration-300">
              <BookOpen size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">棋局规则</h4>
              <p className="text-sm text-slate-500 mt-1">了解标准的五子棋规则与三手交换等专业棋规</p>
            </div>
          </div>
          <div className="glass-chip flex items-center gap-5 p-6 group cursor-pointer">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500 shrink-0 group-hover:bg-amber-100 group-hover:text-amber-600 transition-colors duration-300">
              <BarChart3 size={20} />
            </div>
            <div>
              <h4 className="font-bold text-slate-900">战绩统计</h4>
              <p className="text-sm text-slate-500 mt-1">
                {user ? '查看你的历史对局记录与胜率统计' : '登录后可以保存并查看你的对局记录'}
              </p>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ═══════════════════════════════════════════
  // SETUP SCREEN
  // ═══════════════════════════════════════════
  if (screen === 'setup') {
    return (
      <section className="space-y-6 animate-panel-in">
        <ConfigNotice />
        <div className="panel p-7">
          <div className="mb-6 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">对局设置</p>
              <h1 className="text-3xl font-bold text-slate-900">
                {playerMode === 'ai' ? '人机对弈' : playerMode === 'local' ? '人人本地对弈' : '人人在线对弈'}
              </h1>
            </div>
            <div className="flex gap-2.5">
              <button className="secondary-button" onClick={() => setScreen('home')}>返回首页</button>
              {playerMode !== 'online' && (
                <button className="primary-button" onClick={startGame}>
                  <Play size={18} />开始对弈
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
            {/* Opening Mode */}
            <div className="glass-card">
              <label className="form-label">开局规则</label>
              <div className="segmented mt-2">
                <button className={mode === 'standard' ? 'active' : ''} onClick={() => setMode('standard')}>指定开局</button>
                <button className={mode === 'free' ? 'active' : ''} onClick={() => setMode('free')}>自由开局</button>
              </div>
            </div>

            {/* Side Selection */}
            {(playerMode === 'ai' || playerMode === 'online') && (
              <div className="glass-card">
                <label className="form-label">你执棋方</label>
                <div className="segmented mt-2">
                  <button className={humanSide === 'black' ? 'active' : ''} onClick={() => { setHumanSide('black'); setNCount(2); }}>执黑</button>
                  <button className={humanSide === 'white' ? 'active' : ''} onClick={() => { setHumanSide('white'); setNCount(5); }}>执白</button>
                </div>
              </div>
            )}

            {/* AI Difficulty */}
            {playerMode === 'ai' && (
              <div className="glass-card">
                <label className="form-label">AI 难度</label>
                {difficultyControl}
              </div>
            )}

            {/* Move Time Limit */}
            <div className="glass-card">
              <label className="form-label">出子时间提醒</label>
              <div className="segmented segmented-5 mt-2">
                {MOVE_TIME_LIMIT_OPTIONS.map((seconds) => (
                  <button key={seconds} className={moveTimeLimitSeconds === seconds ? 'active' : ''} onClick={() => setMoveTimeLimitSeconds(seconds)}>
                    {seconds ? `${seconds}s` : '不限'}
                  </button>
                ))}
              </div>
            </div>

            {/* Sound Toggle */}
            <div className="glass-card">
              <label className="form-label">音效反馈</label>
              <button type="button" className="secondary-button mt-2 w-full justify-center" onClick={() => setSoundEnabled((value) => !value)}>
                {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                {soundEnabled ? '已开启' : '已关闭'}
              </button>
            </div>

            {/* Opening Strategy & N-count (standard mode) */}
            {mode === 'standard' && (
              <>
                <div className="glass-card max-lg:col-span-2 max-md:col-span-1">
                  <label className="form-label">开局策略</label>
                  {playerMode === 'ai' && humanSide === 'white' ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">由 AI 自动选择。</p>
                  ) : (
                    <select className="field" value={openingId} onChange={(event) => setOpeningId(event.target.value)}>
                      <option value={CUSTOM_OPENING_ID}>自定义开局</option>
                      {OPENINGS.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="glass-card">
                  <label className="form-label">五手 N 打</label>
                  <input className="field" type="number" min={2} max={5} value={nCount} onChange={(event) => setNCount(Number(event.target.value))} />
                  <div className="segmented mt-3">
                    <button onClick={() => { setOpponentStrength('normal'); setNCount(recommendNForOpponent('normal')); }}>稳健 N=3</button>
                    <button onClick={() => { setOpponentStrength('strong'); setNCount(recommendNForOpponent('strong')); }}>强手 N=4</button>
                  </div>
                </div>
              </>
            )}

            {/* Online Room */}
            {playerMode === 'online' && (
              <div className="glass-card max-lg:col-span-2 max-md:col-span-1">
                <label className="form-label">在线房间</label>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="secondary-button justify-center" onClick={createRoom} disabled={!isSupabaseConfigured}>创建房间</button>
                  <button className="secondary-button justify-center" onClick={joinRoom} disabled={!isSupabaseConfigured}>加入房间</button>
                </div>
                <input className="field mt-3" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())} placeholder="输入房间号" />
                {onlineError && <p className="mt-2 text-sm text-red-600">{onlineError}</p>}
                {!isSupabaseConfigured && <p className="mt-2 text-sm text-slate-500">在线对弈需要先配置 Supabase。</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    );
  }

  // ═══════════════════════════════════════════
  // BOARD SCREEN
  // ═══════════════════════════════════════════
  return (
    <section className="game-screen animate-panel-in">
      <ConfigNotice />
      <div className="game-layout mb-6 grid grid-cols-[minmax(0,1fr)_340px] gap-6 max-lg:grid-cols-1 max-md:gap-4">
        {/* Main Board Area */}
        <div className="panel board-panel p-5">
          <div className="mb-5 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
            <div>
              <h1 className="font-serif text-2xl font-bold text-slate-900">五子棋对弈</h1>
              <p className="mt-1 text-sm text-slate-500">
                当前：{playerMode === 'online' ? `在线房间 ${onlineRoom?.code || ''}` : mode === 'standard' ? openingName : '自由开局'}
                {' · '}
                {playerMode === 'local' ? '本地双人' : `你执${colorShort(humanSide)}`}
              </p>
            </div>
            <div className="flex gap-2">
              <button className="secondary-button" onClick={undo}><Undo2 size={17} />悔棋</button>
              <button className="secondary-button" onClick={startGame}><RotateCcw size={17} />重开</button>
            </div>
          </div>

          {/* Turn Status */}
          <div className={`turn-status ${statusTone}`}>
            <div>
              <span>当前状态</span>
              <strong>{statusLabel}</strong>
            </div>
            <p>{message}</p>
          </div>

          <Board
            board={board}
            nextColor={nextColor}
            moves={moves}
            winningLine={result.line}
            suggestedPoints={suggestedPoints}
            disabled={phase === 'finished'}
            onPlace={place}
          />
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Controls */}
          <div className="panel p-5">
            <h2 className="section-title"><Sparkles size={16} />对局控制</h2>
            <div className="mt-4 space-y-2.5">
              <button type="button" className="secondary-button w-full justify-center" onClick={() => setSoundEnabled((value) => !value)}>
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                {soundEnabled ? '音效开启' : '音效关闭'}
              </button>
              <button type="button" className="secondary-button w-full justify-center" onClick={() => setMusicEnabled((value) => !value)}>
                <Music size={16} />
                {musicEnabled ? '背景音乐开启' : '背景音乐关闭'}
              </button>
              <button className="secondary-button w-full justify-center" onClick={() => setScreen('setup')}>返回设置</button>
              <button className="secondary-button w-full justify-center" onClick={() => setScreen('home')}>返回首页</button>
              {playerMode === 'online' && onlineRoom && (
                <button className="danger-button w-full justify-center mt-1" onClick={leaveOnlineRoom}>
                  <LogOut size={16} />离开房间
                </button>
              )}
            </div>
          </div>

          {/* Rule Help */}
          <div className="panel p-5">
            <button type="button" className="rule-help-toggle" onClick={() => setShowRuleHelp((value) => !value)} aria-expanded={showRuleHelp}>
              <span className="section-title"><HelpCircle size={16} />规则帮助</span>
              <span>{showRuleHelp ? '收起' : '展开'}</span>
            </button>
            {showRuleHelp && (
              <div className="rule-help-body">
                {ruleHelpItems.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            )}
          </div>

          {/* Online Chat */}
          {playerMode === 'online' && (
            <div className="panel liquid-chat p-5">
              <h2 className="section-title"><MessageCircle size={16} />实时互动</h2>
              {pendingUndoRequest && (
                <div className="mt-4 rounded-xl border border-amber-200/60 bg-amber-50/80 p-4 text-sm text-amber-900">
                  <p className="font-bold">对方申请悔棋</p>
                  <p className="mt-1 text-amber-700">同意后棋局将回退一步。</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="primary-button justify-center text-sm" onClick={() => void respondOnlineUndo(true)}>同意</button>
                    <button className="secondary-button justify-center text-sm" onClick={() => void respondOnlineUndo(false)}>拒绝</button>
                  </div>
                </div>
              )}
              <div className="chat-stream mt-4" aria-live="polite">
                {onlineChatMessages.length ? (
                  onlineChatMessages.map((item) => {
                    const mine = item.sender_color === onlineMyColor && item.sender_email === (user?.email || '访客');
                    const systemMessage = item.kind && item.kind !== 'chat';
                    return (
                      <div key={item.id} className={`chat-bubble ${systemMessage ? 'system' : mine ? 'mine' : 'theirs'}`}>
                        <div className="flex items-center justify-between gap-3 text-[11px] font-semibold">
                          <span>{item.sender_color === 'black' ? '黑方' : '白方'} · {item.sender_email || '访客'}</span>
                          <time>{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                        </div>
                        <p>{item.text}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-chat">房间消息会显示在这里。</div>
                )}
                <div ref={chatEndRef} />
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  className="field min-w-0"
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void submitChat();
                    }
                  }}
                  maxLength={180}
                  placeholder="发送消息..."
                  aria-label="发送在线对战消息"
                />
                <button className="primary-button px-3" onClick={submitChat} disabled={!chatInput.trim() || chatSending} aria-label="发送消息">
                  <Send size={17} />
                </button>
              </div>
              {chatError && <p className="mt-2 text-sm text-red-600">{chatError}</p>}
            </div>
          )}

          {/* Game Status */}
          <div className="panel p-5">
            <h2 className="section-title"><Clock3 size={16} />对局状态</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="metric"><span>黑方</span><strong>{formatTime(blackSeconds)}</strong></div>
              <div className="metric"><span>白方</span><strong>{formatTime(whiteSeconds)}</strong></div>
            </div>
            <div className="mt-3 rounded-xl border border-white/40 p-3 text-sm"
              style={{
                background: 'linear-gradient(175deg, rgba(255,255,255,.56) 0%, rgba(255,255,255,.4) 100%)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-semibold text-slate-700"><Bell size={15} />本手用时</span>
                <strong className="tabular-nums text-slate-900">{formatTime(currentTurnSeconds)}</strong>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {moveTimeLimitSeconds ? `提醒阈值：${moveTimeLimitSeconds} 秒，仅提示不判负。` : '提醒阈值：不限时间。'}
              </p>
            </div>

            {/* Message + AI progress */}
            <div className="mt-4 rounded-xl border border-white/40 p-4 text-sm text-slate-700"
              style={{
                background: 'linear-gradient(175deg, rgba(255,255,255,.68) 0%, rgba(255,255,255,.52) 100%)',
              }}
            >
              <p>{message}</p>
              {aiThinking && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/60">
                  <div className="ai-progress-bar h-full rounded-full transition-all duration-300" style={{ width: `${aiProgress}%` }} />
                </div>
              )}
            </div>

            {/* AI Difficulty adjust */}
            {playerMode === 'ai' && (
              <div className="mt-4 rounded-xl p-4 text-sm"
                style={{
                  background: 'linear-gradient(175deg, rgba(255,255,255,.56) 0%, rgba(255,255,255,.4) 100%)',
                }}
              >
                <label className="form-label">对局中调整 AI 难度</label>
                {difficultyControl}
              </div>
            )}

            {/* Swap controls */}
            {phase === 'swap-offer' && whiteControlledByHuman && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="primary-button justify-center" onClick={() => swapSides()}>执行交换</button>
                <button className="secondary-button justify-center" onClick={() => continueWithoutSwap()}>继续白 4</button>
              </div>
            )}

            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <ShieldAlert size={14} />
              黑棋禁手实时判定，白棋无禁手。
            </div>
          </div>

          {/* Move notation */}
          <div className="panel p-5">
            <h2 className="section-title">棋谱</h2>
            <p className="mt-3 max-h-36 overflow-auto rounded-xl p-3 font-mono text-xs leading-6 text-slate-700"
              style={{
                background: 'linear-gradient(175deg, rgba(255,255,255,.6) 0%, rgba(255,255,255,.4) 100%)',
              }}
            >
              {moves.length ? serializeMoves(moves) : '暂无落子'}
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile Action Bar */}
      <div className="mobile-action-bar">
        <div>
          <span>{statusLabel}</span>
          <strong>{formatTime(currentTurnSeconds)}</strong>
        </div>
        <button type="button" onClick={undo} aria-label="悔棋"><Undo2 size={18} /></button>
        <button type="button" onClick={startGame} aria-label="重开"><RotateCcw size={18} /></button>
        <button type="button" onClick={() => setShowRuleHelp((value) => !value)} aria-label="规则帮助"><HelpCircle size={18} /></button>
      </div>
    </section>
  );
}
