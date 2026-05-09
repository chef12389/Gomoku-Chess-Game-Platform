import { applyMove, detectForbidden, evaluateTerminal, getCandidateMoves, isInside, opponent } from './board';
import type { Cell, Point, Stone } from '../types';

const SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;
const WIN_SCORE = 10_000_000;
const LOSS_SCORE = -WIN_SCORE;
const BOARD_CENTER = 7;

const DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
] as const;

const SCORES = {
  FIVE: 10_000_000,
  LIVE_FOUR: 1_000_000,
  RUSH_FOUR: 100_000,
  LIVE_THREE: 100_000,
  SLEEP_THREE: 10_000,
  LIVE_TWO: 10_000,
  SLEEP_TWO: 1_000,
  LIVE_ONE: 1_000,
  SLEEP_ONE: 100,
};

const RENJU_PRO_BOOK: Record<string, Point[]> = {
  '7-7|6-7|6-5': [{ row: 8, col: 7 }, { row: 8, col: 6 }, { row: 7, col: 5 }],
  '7-7|6-7|5-8': [{ row: 8, col: 6 }, { row: 8, col: 7 }, { row: 6, col: 9 }],
  '7-7|6-6|5-7': [{ row: 8, col: 7 }, { row: 7, col: 8 }, { row: 8, col: 6 }],
  '7-7|6-6|5-9': [{ row: 8, col: 6 }, { row: 7, col: 8 }, { row: 9, col: 5 }],
};

interface ScoredPoint extends Point {
  score: number;
  policy?: string;
}

interface SearchOptions {
  maxDepth: number;
  timeLimitMs: number;
  mctsPlayouts: number;
}

interface MoveCandidate {
  r: number;
  c: number;
  val: number;
}

interface LineInfo {
  count: number;
  block: number;
  empty: number;
}

interface TTEntry {
  score: number;
  depth: number;
  flag: 'exact' | 'lower' | 'upper';
}

type NumericStone = typeof EMPTY | typeof BLACK | typeof WHITE;
type NumericBoard = NumericStone[][];

function colorToNumber(color: Stone): NumericStone {
  return color === 'black' ? BLACK : WHITE;
}

function toNumericBoard(board: Cell[][]): NumericBoard {
  return board.map((row) => row.map((cell) => (cell === 'black' ? BLACK : cell === 'white' ? WHITE : EMPTY)));
}

function isEmptyBoard(board: NumericBoard): boolean {
  return board.every((row) => row.every((cell) => cell === EMPTY));
}

function pointDistanceScore(r: number, c: number): number {
  const distance = Math.abs(r - BOARD_CENTER) + Math.abs(c - BOARD_CENTER);
  return (28 - distance) * 20;
}

class GomokuSearchEngine {
  private bestMove: MoveCandidate | null = null;
  private tt = new Map<string, TTEntry>();
  private nodesSearched = 0;
  private ttHits = 0;
  private startedAt = 0;
  private maxDepth = 6;
  private rootDepth = 6;
  private timeLimitMs = 2800;
  private candidateRange = 2;

  findBestMove(sourceBoard: Cell[][], color: Stone, options: SearchOptions): ScoredPoint {
    const board = toNumericBoard(sourceBoard);
    const aiPlayer = colorToNumber(color);
    this.bestMove = null;
    this.tt.clear();
    this.nodesSearched = 0;
    this.ttHits = 0;
    this.startedAt = performance.now();
    this.maxDepth = options.maxDepth;
    this.rootDepth = options.maxDepth;
    this.timeLimitMs = options.timeLimitMs;

    const book = this.openingBookMove(sourceBoard, color);
    if (book) return book;

    if (isEmptyBoard(board)) return { row: 7, col: 7, score: WIN_SCORE, policy: 'tengen' };

    const urgent = this.findUrgentMove(board, aiPlayer);
    if (urgent) return { row: urgent.r, col: urgent.c, score: WIN_SCORE - 1, policy: urgent.val > 0 ? 'urgent' : 'defense' };

    for (let depth = 2; depth <= this.maxDepth; depth += 2) {
      if (this.isTimedOut(0.8)) break;
      this.rootDepth = depth;
      this.alphaBeta(board, depth, LOSS_SCORE * 10, WIN_SCORE * 10, true, aiPlayer);
    }

    const fallback = this.bestMove ?? this.generateMoves(board, aiPlayer, this.candidateRange)[0] ?? { r: 7, c: 7, val: 0 };
    return { row: fallback.r, col: fallback.c, score: fallback.val, policy: `alpha-beta-d${this.rootDepth}` };
  }

  private isTimedOut(ratio = 1): boolean {
    return this.timeLimitMs > 0 && performance.now() - this.startedAt > this.timeLimitMs * ratio;
  }

  private inBounds(r: number, c: number): boolean {
    return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
  }

  private isLegalMove(board: NumericBoard, r: number, c: number, player: NumericStone): boolean {
    if (!this.inBounds(r, c) || board[r][c] !== EMPTY) return false;
    if (player !== BLACK) return true;
    board[r][c] = BLACK;
    const forbidden = this.isFastBlackForbidden(board, r, c);
    board[r][c] = EMPTY;
    return !forbidden;
  }

  private countDirectional(board: NumericBoard, r: number, c: number, dr: number, dc: number, player: NumericStone): number {
    let count = 1;
    for (const sign of [-1, 1]) {
      let step = 1;
      while (true) {
        const nr = r + dr * step * sign;
        const nc = c + dc * step * sign;
        if (!this.inBounds(nr, nc) || board[nr][nc] !== player) break;
        count += 1;
        step += 1;
      }
    }
    return count;
  }

  private hasOverline(board: NumericBoard, r: number, c: number, player: NumericStone): boolean {
    return DIRS.some(([dr, dc]) => this.countDirectional(board, r, c, dr, dc, player) > 5);
  }

  private isExactFiveAt(board: NumericBoard, r: number, c: number, player: NumericStone): boolean {
    return DIRS.some(([dr, dc]) => this.countDirectional(board, r, c, dr, dc, player) === 5);
  }

  private countFourLikeDirections(board: NumericBoard, r: number, c: number, player: NumericStone): number {
    let total = 0;
    for (const [dr, dc] of DIRS) {
      const info = this.getLineInfo(board, r, c, dr, dc, player);
      if (info.count === 4 && info.block < 2) total += 1;
    }
    return total;
  }

  private countOpenThreeLikeDirections(board: NumericBoard, r: number, c: number, player: NumericStone): number {
    let total = 0;
    for (const [dr, dc] of DIRS) {
      const info = this.getLineInfo(board, r, c, dr, dc, player);
      if (info.count === 3 && info.block === 0) total += 1;
    }
    return total;
  }

  private isFastBlackForbidden(board: NumericBoard, r: number, c: number): boolean {
    if (this.hasOverline(board, r, c, BLACK)) return true;
    if (this.countFourLikeDirections(board, r, c, BLACK) >= 2) return true;
    return this.countOpenThreeLikeDirections(board, r, c, BLACK) >= 2;
  }

  private getLineInfo(board: NumericBoard, r: number, c: number, dr: number, dc: number, player: NumericStone): LineInfo {
    let count = 1;
    let block = 0;
    let empty1 = 0;
    let empty2 = 0;

    let index = 1;
    while (true) {
      const nr = r + dr * index;
      const nc = c + dc * index;
      if (!this.inBounds(nr, nc)) {
        block += 1;
        break;
      }
      if (board[nr][nc] === player) {
        count += 1;
        index += 1;
      } else if (board[nr][nc] === EMPTY) {
        empty1 += 1;
        break;
      } else {
        block += 1;
        break;
      }
    }

    index = 1;
    while (true) {
      const nr = r - dr * index;
      const nc = c - dc * index;
      if (!this.inBounds(nr, nc)) {
        block += 1;
        break;
      }
      if (board[nr][nc] === player) {
        count += 1;
        index += 1;
      } else if (board[nr][nc] === EMPTY) {
        empty2 += 1;
        break;
      } else {
        block += 1;
        break;
      }
    }

    return { count, block, empty: empty1 + empty2 };
  }

  private shapeScore(count: number, block: number): number {
    if (count >= 5) return SCORES.FIVE;
    if (block === 2) return 0;
    switch (count) {
      case 4:
        return block === 0 ? SCORES.LIVE_FOUR : SCORES.RUSH_FOUR;
      case 3:
        return block === 0 ? SCORES.LIVE_THREE : SCORES.SLEEP_THREE;
      case 2:
        return block === 0 ? SCORES.LIVE_TWO : SCORES.SLEEP_TWO;
      case 1:
        return block === 0 ? SCORES.LIVE_ONE : SCORES.SLEEP_ONE;
      default:
        return 0;
    }
  }

  private evaluatePoint(board: NumericBoard, r: number, c: number, player: NumericStone): number {
    if (board[r][c] !== player) return 0;
    let score = 0;
    for (const [dr, dc] of DIRS) {
      const info = this.getLineInfo(board, r, c, dr, dc, player);
      score += this.shapeScore(info.count, info.block);
    }
    return score;
  }

  private quickEval(board: NumericBoard, r: number, c: number, player: NumericStone): number {
    let score = 0;
    for (const [dr, dc] of DIRS) {
      const info = this.getLineInfo(board, r, c, dr, dc, player);
      score += this.shapeScore(info.count, info.block);
    }
    return score;
  }

  private forbiddenTrapScore(board: NumericBoard, r: number, c: number, player: NumericStone): number {
    const enemy = player === BLACK ? WHITE : BLACK;
    if (enemy !== BLACK) return 0;
    board[r][c] = player;
    let trap = 0;
    const visited = new Set<number>();
    for (let dr = -2; dr <= 2; dr += 1) {
      for (let dc = -2; dc <= 2; dc += 1) {
        const nr = r + dr;
        const nc = c + dc;
        if (!this.inBounds(nr, nc) || board[nr][nc] !== EMPTY) continue;
        const key = nr * SIZE + nc;
        if (visited.has(key)) continue;
        visited.add(key);
        board[nr][nc] = BLACK;
        if (this.isFastBlackForbidden(board, nr, nc)) trap += 180_000;
        board[nr][nc] = EMPTY;
      }
    }
    board[r][c] = EMPTY;
    return Math.min(trap, 1_200_000);
  }

  private evaluate(board: NumericBoard, aiPlayer: NumericStone): number {
    const humanPlayer = aiPlayer === BLACK ? WHITE : BLACK;
    let aiScore = 0;
    let humanScore = 0;

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (board[r][c] === aiPlayer) aiScore += this.evaluatePoint(board, r, c, aiPlayer);
        else if (board[r][c] === humanPlayer) humanScore += this.evaluatePoint(board, r, c, humanPlayer);
      }
    }

    return aiScore - humanScore * 1.15;
  }

  private generateMoves(board: NumericBoard, currentPlayer: NumericStone, range: number, strictLegal = true): MoveCandidate[] {
    const moves: MoveCandidate[] = [];
    const visited = new Set<number>();

    if (isEmptyBoard(board)) return [{ r: 7, c: 7, val: WIN_SCORE }];

    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        if (board[r][c] === EMPTY) continue;
        for (let dr = -range; dr <= range; dr += 1) {
          for (let dc = -range; dc <= range; dc += 1) {
            const nr = r + dr;
            const nc = c + dc;
            if (!this.inBounds(nr, nc) || board[nr][nc] !== EMPTY) continue;
            const key = nr * SIZE + nc;
            if (visited.has(key)) continue;
            visited.add(key);
            if (strictLegal && !this.isLegalMove(board, nr, nc, currentPlayer)) continue;

            let val = pointDistanceScore(nr, nc);
            if (!strictLegal || this.isLegalMove(board, nr, nc, currentPlayer)) {
              board[nr][nc] = currentPlayer;
              val += this.quickEval(board, nr, nc, currentPlayer) * 1.08;
              if (currentPlayer === WHITE) val += this.forbiddenTrapScore(board, nr, nc, currentPlayer);
              board[nr][nc] = EMPTY;
            }

            const enemy = currentPlayer === BLACK ? WHITE : BLACK;
            if (!strictLegal || this.isLegalMove(board, nr, nc, enemy)) {
              board[nr][nc] = enemy;
              val += this.quickEval(board, nr, nc, enemy) * 1.02;
              board[nr][nc] = EMPTY;
            }

            moves.push({ r: nr, c: nc, val });
          }
        }
      }
    }

    return moves.sort((a, b) => b.val - a.val);
  }

  private isFive(board: NumericBoard, r: number, c: number, player: NumericStone): boolean {
    return this.isExactFiveAt(board, r, c, player) || (player === WHITE && this.hasOverline(board, r, c, WHITE));
  }

  private alphaBeta(
    board: NumericBoard,
    depth: number,
    alphaStart: number,
    betaStart: number,
    isMaximizing: boolean,
    aiPlayer: NumericStone,
  ): number {
    this.nodesSearched += 1;
    if (this.isTimedOut()) return this.evaluate(board, aiPlayer);

    let alpha = alphaStart;
    let beta = betaStart;
    const boardKey = this.boardHash(board, depth, isMaximizing, aiPlayer);
    const ttEntry = this.tt.get(boardKey);
    if (ttEntry && ttEntry.depth >= depth) {
      this.ttHits += 1;
      if (ttEntry.flag === 'exact') return ttEntry.score;
      if (ttEntry.flag === 'lower' && ttEntry.score > alpha) alpha = ttEntry.score;
      if (ttEntry.flag === 'upper' && ttEntry.score < beta) beta = ttEntry.score;
      if (alpha >= beta) return ttEntry.score;
    }

    if (depth <= 0) return this.evaluate(board, aiPlayer);

    const currentPlayer = isMaximizing ? aiPlayer : aiPlayer === BLACK ? WHITE : BLACK;
    const moves = this.generateMoves(board, currentPlayer, this.candidateRange);
    if (moves.length === 0) return this.evaluate(board, aiPlayer);

    const maxMoves = depth >= 6 ? 10 : depth >= 4 ? 12 : depth >= 2 ? 16 : 20;
    const topMoves = moves.slice(0, maxMoves);
    const alphaOriginal = alpha;
    const betaOriginal = beta;
    let bestScore = isMaximizing ? -Infinity : Infinity;

    for (const move of topMoves) {
      if (!this.isLegalMove(board, move.r, move.c, currentPlayer)) continue;
      board[move.r][move.c] = currentPlayer;
      const terminal = this.isFive(board, move.r, move.c, currentPlayer);
      const score = terminal
        ? currentPlayer === aiPlayer ? SCORES.FIVE + depth : -SCORES.FIVE - depth
        : this.alphaBeta(board, depth - 1, alpha, beta, !isMaximizing, aiPlayer);
      board[move.r][move.c] = EMPTY;

      if (isMaximizing) {
        if (score > bestScore) {
          bestScore = score;
          if (depth === this.rootDepth) this.bestMove = move;
        }
        alpha = Math.max(alpha, score);
      } else {
        bestScore = Math.min(bestScore, score);
        beta = Math.min(beta, score);
      }
      if (alpha >= beta) break;
    }

    const flag = bestScore <= alphaOriginal ? 'upper' : bestScore >= betaOriginal ? 'lower' : 'exact';
    this.tt.set(boardKey, { score: bestScore, depth, flag });
    return bestScore;
  }

  private findUrgentMove(board: NumericBoard, aiPlayer: NumericStone): MoveCandidate | null {
    const humanPlayer = aiPlayer === BLACK ? WHITE : BLACK;
    const moves = this.generateMoves(board, aiPlayer, 2);

    for (const move of moves) {
      if (!this.isLegalMove(board, move.r, move.c, aiPlayer)) continue;
      board[move.r][move.c] = aiPlayer;
      const win = this.isFive(board, move.r, move.c, aiPlayer);
      board[move.r][move.c] = EMPTY;
      if (win) return { ...move, val: WIN_SCORE };
    }

    for (const move of moves) {
      if (!this.isLegalMove(board, move.r, move.c, humanPlayer)) continue;
      board[move.r][move.c] = humanPlayer;
      const win = this.isFive(board, move.r, move.c, humanPlayer);
      board[move.r][move.c] = EMPTY;
      if (win && this.isLegalMove(board, move.r, move.c, aiPlayer)) return { ...move, val: WIN_SCORE - 10 };
    }

    const ownLiveFour = this.findLiveFourMove(board, aiPlayer, moves);
    if (ownLiveFour) return ownLiveFour;

    const enemyLiveFour = this.findLiveFourMove(board, humanPlayer, moves);
    if (enemyLiveFour && this.isLegalMove(board, enemyLiveFour.r, enemyLiveFour.c, aiPlayer)) {
      return { ...enemyLiveFour, val: WIN_SCORE - 100 };
    }

    return null;
  }

  private findLiveFourMove(board: NumericBoard, player: NumericStone, moves: MoveCandidate[]): MoveCandidate | null {
    for (const move of moves) {
      if (!this.isLegalMove(board, move.r, move.c, player)) continue;
      board[move.r][move.c] = player;
      let hasLiveFour = false;
      for (const [dr, dc] of DIRS) {
        const info = this.getLineInfo(board, move.r, move.c, dr, dc, player);
        if (info.count === 4 && info.block === 0) {
          hasLiveFour = true;
          break;
        }
      }
      board[move.r][move.c] = EMPTY;
      if (hasLiveFour) return { ...move, val: WIN_SCORE - 1_000 };
    }
    return null;
  }

  private boardHash(board: NumericBoard, depth: number, isMaximizing: boolean, aiPlayer: NumericStone): string {
    let hash = 0;
    for (let r = 0; r < SIZE; r += 1) {
      for (let c = 0; c < SIZE; c += 1) {
        hash = ((hash << 5) - hash + board[r][c] * 31 * (r * SIZE + c + 1)) | 0;
      }
    }
    return `${hash}:${depth}:${isMaximizing ? 1 : 0}:${aiPlayer}`;
  }

  private openingBookMove(board: Cell[][], color: Stone): ScoredPoint | null {
    const occupied: { point: Point; color: Stone }[] = [];
    board.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
      if (cell) occupied.push({ point: { row: rowIndex, col: colIndex }, color: cell });
    }));

    if (occupied.length === 0 && color === 'black') return { row: 7, col: 7, score: WIN_SCORE, policy: 'tengen' };
    if (occupied.length === 1 && color === 'white') {
      const options = [{ row: 6, col: 6 }, { row: 6, col: 7 }, { row: 7, col: 6 }, { row: 8, col: 8 }];
      const legal = options.find((point) => this.isLegalMove(toNumericBoard(board), point.row, point.col, WHITE));
      return legal ? { ...legal, score: 780_000, policy: 'opening-book' } : null;
    }

    if (occupied.length >= 3 && occupied.length <= 6) {
      const white2 = occupied.find((item) => item.color === 'white')?.point;
      const black3 = occupied.find((item) => item.color === 'black' && (item.point.row !== 7 || item.point.col !== 7))?.point;
      if (board[7][7] && white2 && black3) {
        const key = `7-7|${white2.row}-${white2.col}|${black3.row}-${black3.col}`;
        const numeric = toNumericBoard(board);
        const legal = (RENJU_PRO_BOOK[key] ?? [])
          .filter((point) => this.isLegalMove(numeric, point.row, point.col, colorToNumber(color)))
          .map((point) => ({ ...point, score: 1_200_000 + pointDistanceScore(point.row, point.col), policy: 'renju-book' }))
          .sort((a, b) => b.score - a.score)[0];
        if (legal) return legal;
      }
    }

    return null;
  }
}

export function chooseAiMove(board: Cell[][], color: Stone, options: Partial<SearchOptions> = {}): ScoredPoint {
  const merged: SearchOptions = {
    maxDepth: 6,
    timeLimitMs: 0,
    mctsPlayouts: 0,
    ...options,
  };
  const engine = new GomokuSearchEngine();
  const move = engine.findBestMove(board, color, merged);

  if (isInside(move) && !board[move.row][move.col]) {
    if (color !== 'black') return move;
    const next = applyMove(board, move, color);
    if (!detectForbidden(next, move).isForbidden) return move;
  }

  const fallback = getCandidateMoves(board, 2).find((point) => {
    if (board[point.row][point.col]) return false;
    if (color !== 'black') return true;
    return !detectForbidden(applyMove(board, point, color), point).isForbidden;
  });
  return fallback ? { ...fallback, score: 0, policy: 'legal-fallback' } : { row: 7, col: 7, score: 0, policy: 'fallback' };
}
