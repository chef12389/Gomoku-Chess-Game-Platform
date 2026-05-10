import { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Bot, Clock3, LogOut, MessageCircle, Music, Play, RotateCcw, Send, ShieldAlert, Sparkles, Undo2, Users, Volume2, VolumeX, Wifi } from 'lucide-react';
import { Board } from '../components/Board';
import { ConfigNotice } from '../components/ConfigNotice';
import { useAuth } from '../hooks/useAuth';
import { chooseAiMove } from '../lib/ai';
import { applyMove, CENTER, createBoard, detectForbidden, evaluateTerminal, opponent, serializeMoves } from '../lib/board';
import {
  createNMoveCandidates,
  isBadOpening,
  isBalancedOpening,
  isInBlackThreeZone,
  openingStrategyLabel,
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
const backgroundMusicPath = '/music/background.ogg';

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
        setMessage(`未找到或无法播放背景音乐，请将文件放到 public/music/background.ogg 后再开启。`);
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
      setMessage(`进入五手 N 打：黑方需要放置 ${nCount} 个候选黑 5。`);
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
          setMessage(
            openingName && isBalancedOpening(openingName)
              ? `AI 面对平衡开局选择不交换，并已落下白 4。进入五手 N 打：黑方需要放置 ${nCount} 个候选黑 5。`
              : `AI 判断不交换，并已落下白 4。进入五手 N 打：黑方需要放置 ${nCount} 个候选黑 5。`,
          );
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

  const nMovePrompt = phase === 'n-move'
    ? nextColor === 'black'
      ? `五手 N 打开始：请黑方在棋盘上选择第 ${nCandidates.length + 1} / ${nCount} 个黑 5 候选点。`
      : `五手 N 打选择：请白方从 ${nCandidates.length} 个候选点中保留 1 个作为正式黑 5。`
    : '';

  if (screen === 'home') {
    return (
      <section className="space-y-7 animate-panel-in">
        <ConfigNotice />
        <div className="liquid-hero min-h-[360px]">
          <div className="relative z-10 grid min-h-[280px] items-center gap-8">
            <div>
              <p className="text-sm font-semibold tracking-[.24em] text-amber-200/80">RENJU ARENA</p>
              <h1 className="mt-5 font-serif text-6xl font-semibold leading-tight max-md:text-4xl">欢迎来到五子棋对弈平台</h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-amber-100/80">
                支持指定开局自动摆子、自定义前三手、三手交换、五手 N 打与禁手判定。
              </p>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-1">
          <button className="home-mode-card" onClick={() => chooseMode('ai')}>
            <Bot className="mb-5 text-amber-600" size={34} />
            <h2 className="text-2xl font-semibold">人机对弈</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">和 AI 练习攻防，可在对局中调整难度。</p>
          </button>
          <button className="home-mode-card" onClick={() => chooseMode('local')}>
            <Users className="mb-5 text-amber-600" size={34} />
            <h2 className="text-2xl font-semibold">人人本地对弈</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">同屏轮流落子，适合面对面复盘和练习。</p>
          </button>
          <button className="home-mode-card" onClick={() => chooseMode('online')}>
            <Wifi className="mb-5 text-amber-600" size={34} />
            <h2 className="text-2xl font-semibold">人人在线对弈</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">创建或加入房间，与远端玩家对局。</p>
          </button>
        </div>
      </section>
    );
  }

  if (screen === 'setup') {
    const selectedOpening = OPENINGS.find((item) => item.id === openingId) || selectBalancedOpening();
    return (
      <section className="space-y-6 animate-panel-in">
        <ConfigNotice />
        <div className="panel p-7">
          <div className="mb-6 flex items-end justify-between gap-4 max-md:flex-col max-md:items-start">
            <div>
              <p className="text-sm font-semibold text-amber-700">对局设置</p>
              <h1 className="mt-2 text-3xl font-semibold">
                {playerMode === 'ai' ? '人机对弈' : playerMode === 'local' ? '人人本地对弈' : '人人在线对弈'}
              </h1>
            </div>
            <div className="flex gap-2">
              <button className="secondary-button" onClick={() => setScreen('home')}>返回首页</button>
              {playerMode !== 'online' && <button className="primary-button" onClick={startGame}><Play size={18} />开始对弈</button>}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-5 max-lg:grid-cols-2 max-md:grid-cols-1">
            <div className="glass-card">
              <label className="form-label">开局规则</label>
              <div className="segmented mt-2">
                <button className={mode === 'standard' ? 'active' : ''} onClick={() => setMode('standard')}>指定开局</button>
                <button className={mode === 'free' ? 'active' : ''} onClick={() => setMode('free')}>自由开局</button>
              </div>
            </div>
            {(playerMode === 'ai' || playerMode === 'online') && (
              <div className="glass-card">
                <label className="form-label">你执棋方</label>
                <div className="segmented mt-2">
                  <button className={humanSide === 'black' ? 'active' : ''} onClick={() => { setHumanSide('black'); setNCount(2); }}>执黑</button>
                  <button className={humanSide === 'white' ? 'active' : ''} onClick={() => { setHumanSide('white'); setNCount(5); }}>执白</button>
                </div>
              </div>
            )}
            {playerMode === 'ai' && (
              <div className="glass-card">
                <label className="form-label">AI 难度</label>
                {difficultyControl}
              </div>
            )}
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
            <div className="glass-card">
              <label className="form-label">音效反馈</label>
              <button type="button" className="secondary-button mt-2 w-full justify-center" onClick={() => setSoundEnabled((value) => !value)}>
                {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
                {soundEnabled ? '已开启' : '已关闭'}
              </button>
            </div>
            {mode === 'standard' && (
              <>
                <div className="glass-card max-lg:col-span-2 max-md:col-span-1">
                  <label className="form-label">开局策略</label>
                  {playerMode === 'ai' && humanSide === 'white' ? (
                    <p className="mt-2 text-sm leading-6 text-slate-600">你执白时，AI 会从疏星、瑞星、丘月、松月、斜月中选择平衡开局并直接摆好前三手。</p>
                  ) : (
                    <select className="field" value={openingId} onChange={(event) => setOpeningId(event.target.value)}>
                      <option value={CUSTOM_OPENING_ID}>自定义开局</option>
                      {OPENINGS.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} · {openingStrategyLabel(item.name)}
                        </option>
                      ))}
                    </select>
                  )}
                  {!(playerMode === 'ai' && humanSide === 'white') && openingId !== CUSTOM_OPENING_ID && (
                    <p className="mt-2 text-sm text-slate-600">当前选择：{selectedOpening.name} · {openingStrategyLabel(selectedOpening.name)}</p>
                  )}
                </div>
                <div className="glass-card">
                  <label className="form-label">五手 N 打</label>
                  <input className="field" type="number" min={2} max={5} value={nCount} onChange={(event) => setNCount(Number(event.target.value))} />
                  <div className="segmented mt-3">
                    <button onClick={() => { setOpponentStrength('normal'); setNCount(recommendNForOpponent('normal')); }}>稳健 N=3</button>
                    <button onClick={() => { setOpponentStrength('strong'); setNCount(recommendNForOpponent('strong')); }}>强手 N=4</button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-500">策略建议：执黑首选 2 打，执白首选 5 打，求平衡选 3 打。</p>
                </div>
              </>
            )}
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

  return (
    <section className="animate-panel-in">
      <ConfigNotice />
      <div className="mb-6 grid grid-cols-[minmax(0,1fr)_360px] gap-6 max-lg:grid-cols-1 max-md:gap-4">
        <div className="panel p-5">
          <div className="mb-5 flex items-center justify-between gap-4 max-md:flex-col max-md:items-start">
            <div>
              <h1 className="font-serif text-3xl font-semibold">五子棋对弈</h1>
              <p className="mt-1 text-sm text-slate-600">
                当前：{playerMode === 'online' ? `在线房间 ${onlineRoom?.code || ''}` : mode === 'standard' ? openingName : '自由开局'}
                {' · '}
                {playerMode === 'local' ? '本地双人' : `你执${colorShort(humanSide)}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 max-md:w-full">
              <button className="secondary-button" onClick={undo}><Undo2 size={17} />悔棋</button>
              <button className="secondary-button" onClick={startGame}><RotateCcw size={17} />重开</button>
            </div>
          </div>
          <Board board={board} nextColor={nextColor} moves={moves} winningLine={result.line} suggestedPoints={suggestedPoints} disabled={phase === 'finished'} onPlace={place} />
        </div>
        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="section-title"><Sparkles size={18} />对局控制</h2>
            <button type="button" className="secondary-button mt-4 w-full justify-center" onClick={() => setSoundEnabled((value) => !value)}>
              {soundEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
              {soundEnabled ? '音效开启' : '音效关闭'}
            </button>
            <button type="button" className="secondary-button mt-3 w-full justify-center" onClick={() => setMusicEnabled((value) => !value)}>
              <Music size={17} />
              {musicEnabled ? '背景音乐开启' : '背景音乐关闭'}
            </button>
            <p className="mt-2 text-xs leading-5 text-slate-500">音乐文件目录：public/music/background.ogg</p>
            <button className="secondary-button mt-3 w-full justify-center" onClick={() => setScreen('setup')}>返回设置</button>
            <button className="secondary-button mt-3 w-full justify-center" onClick={() => setScreen('home')}>返回首页</button>
            {playerMode === 'online' && onlineRoom && (
              <button className="danger-button mt-3 w-full justify-center" onClick={leaveOnlineRoom}>
                <LogOut size={17} />
                离开房间
              </button>
            )}
          </div>
          {playerMode === 'online' && (
            <div className="panel liquid-chat p-5">
              <h2 className="section-title"><MessageCircle size={18} />实时互动</h2>
              {pendingUndoRequest && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900">
                  <p className="font-semibold">对方申请悔棋</p>
                  <p className="mt-1">同意后棋局将回退一步。</p>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button className="primary-button justify-center" onClick={() => void respondOnlineUndo(true)}>同意</button>
                    <button className="secondary-button justify-center" onClick={() => void respondOnlineUndo(false)}>拒绝</button>
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
                  <Send size={18} />
                </button>
              </div>
              {chatError && <p className="mt-2 text-sm text-red-600">{chatError}</p>}
            </div>
          )}
          <div className="panel p-5">
            <h2 className="section-title"><Clock3 size={18} />对局状态</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="metric"><span>黑方</span><strong>{formatTime(blackSeconds)}</strong></div>
              <div className="metric"><span>白方</span><strong>{formatTime(whiteSeconds)}</strong></div>
            </div>
            <div className="mt-3 rounded-lg border border-white/70 bg-white/55 p-3 text-sm text-slate-700">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 font-semibold"><Bell size={16} />本手用时</span>
                <strong className="tabular-nums">{formatTime(currentTurnSeconds)}</strong>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {moveTimeLimitSeconds ? `提醒阈值：${moveTimeLimitSeconds} 秒，仅提示不判负。` : '提醒阈值：不限时间。'}
              </p>
            </div>
            <div className="mt-4 rounded-lg bg-slate-950 p-4 text-amber-100 shadow-stone">
              <p className="text-sm">{message}</p>
              {nMovePrompt && <p className="mt-2 text-sm font-semibold text-amber-200">{nMovePrompt}</p>}
              {aiThinking && (
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15">
                  <div className="ai-progress-bar h-full rounded-full transition-all duration-300" style={{ width: `${aiProgress}%` }} />
                </div>
              )}
            </div>
            {playerMode === 'ai' && (
              <div className="mt-4 rounded-lg bg-white/70 p-4 text-sm text-slate-700">
                <label className="form-label">对局中调整 AI 难度</label>
                {difficultyControl}
              </div>
            )}
            {phase === 'swap-offer' && whiteControlledByHuman && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button className="primary-button justify-center" onClick={() => swapSides()}>执行交换</button>
                <button className="secondary-button justify-center" onClick={() => continueWithoutSwap()}>继续白 4</button>
              </div>
            )}
            {phase === 'n-move' && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white/70 p-3 text-sm">
                <p className="font-semibold text-slate-800">
                  {nextColor === 'black'
                    ? `五手 N 打：黑方继续放置候选点 ${nCandidates.length + 1} / ${nCount}`
                    : '五手 N 打：白方从候选点中保留一个'}
                </p>
                <p>黑 5 候选点：{formatBoardPoints(nCandidates)}</p>
                <p className="mt-1 text-slate-500">白方从候选点中保留一个，其余移除。</p>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-600">
              <ShieldAlert size={16} />
              黑棋禁手实时判定，白棋无禁手。
            </div>
          </div>
          <div className="panel p-5">
            <h2 className="section-title">棋谱</h2>
            <p className="mt-3 max-h-36 overflow-auto rounded-lg bg-white/60 p-3 font-mono text-xs leading-6 text-slate-700">{moves.length ? serializeMoves(moves) : '暂无落子'}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
