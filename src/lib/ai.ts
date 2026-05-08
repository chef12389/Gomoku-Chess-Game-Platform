import { applyMove, detectForbidden, DIRECTIONS, evaluateTerminal, getCandidateMoves, isInside, opponent } from './board';
import type { Cell, Point, Stone } from '../types';

const WIN_SCORE = 1_000_000_000;
const LOSS_SCORE = -WIN_SCORE;
const BOARD_CENTER = 7;

interface ScoredPoint extends Point {
  score: number;
  policy?: string;
}

interface SearchOptions {
  maxDepth: number;
  timeLimitMs: number;
  mctsPlayouts: number;
}

interface ShapeStats {
  maxLine: number;
  openFour: number;
  closedFour: number;
  openThree: number;
  brokenThree: number;
  openTwo: number;
  forbidden: boolean;
}

interface MctsNode {
  point: ScoredPoint;
  wins: number;
  visits: number;
  prior: number;
}

function isLegalMove(board: Cell[][], point: Point, color: Stone): boolean {
  if (!isInside(point) || board[point.row][point.col]) return false;
  if (color !== 'black') return true;
  const next = applyMove(board, point, color);
  return !detectForbidden(next, point).isForbidden;
}

function directionalText(board: Cell[][], point: Point, color: Stone, direction: Point): string {
  const chars: string[] = [];
  for (let step = -5; step <= 5; step += 1) {
    const cursor = { row: point.row + direction.row * step, col: point.col + direction.col * step };
    if (!isInside(cursor)) chars.push('x');
    else {
      const cell = board[cursor.row][cursor.col];
      chars.push(cell === color ? '1' : cell === null ? '0' : '2');
    }
  }
  return chars.join('');
}

function countLine(board: Cell[][], point: Point, color: Stone, direction: Point): { count: number; open: number } {
  let count = 1;
  let open = 0;
  for (const sign of [-1, 1]) {
    let cursor = { row: point.row + direction.row * sign, col: point.col + direction.col * sign };
    while (isInside(cursor) && board[cursor.row][cursor.col] === color) {
      count += 1;
      cursor = { row: cursor.row + direction.row * sign, col: cursor.col + direction.col * sign };
    }
    if (isInside(cursor) && board[cursor.row][cursor.col] === null) open += 1;
  }
  return { count, open };
}

function analyzeShape(board: Cell[][], point: Point, color: Stone): ShapeStats {
  if (!isLegalMove(board, point, color)) {
    return { maxLine: 0, openFour: 0, closedFour: 0, openThree: 0, brokenThree: 0, openTwo: 0, forbidden: true };
  }
  const next = applyMove(board, point, color);
  let maxLine = 0;
  let openFour = 0;
  let closedFour = 0;
  let openThree = 0;
  let brokenThree = 0;
  let openTwo = 0;

  for (const direction of DIRECTIONS) {
    const { count, open } = countLine(next, point, color, direction);
    maxLine = Math.max(maxLine, count);
    if (count >= 5) continue;
    if (count === 4 && open === 2) openFour += 1;
    else if (count === 4 && open === 1) closedFour += 1;
    else if (count === 3 && open === 2) openThree += 1;
    else if (count === 2 && open === 2) openTwo += 1;

    const text = directionalText(next, point, color, direction);
    if (/010110|011010|0101110|0111010/.test(text)) brokenThree += 1;
    if (/011110/.test(text)) openFour += 1;
    if (/10111|11011|11101|01111|11110/.test(text)) closedFour += 1;
  }

  return { maxLine, openFour, closedFour, openThree, brokenThree, openTwo, forbidden: false };
}

function terminalScore(board: Cell[][], point: Point, color: Stone, aiColor: Stone, depth: number): number | null {
  const terminal = evaluateTerminal(board, { ...point, color, index: 0 });
  if (!terminal.reason) return null;
  if (terminal.winner === aiColor) return WIN_SCORE + depth * 10;
  if (terminal.winner === opponent(aiColor)) return LOSS_SCORE - depth * 10;
  return 0;
}

function shapeScore(shape: ShapeStats): number {
  if (shape.forbidden) return LOSS_SCORE / 2;
  if (shape.maxLine >= 5) return 80_000_000;
  let score = 0;
  score += shape.openFour * 5_200_000;
  score += shape.closedFour * 860_000;
  score += shape.openThree * 180_000;
  score += shape.brokenThree * 82_000;
  score += shape.openTwo * 8_200;
  if (shape.openFour >= 2) score += 12_000_000;
  if (shape.openFour && (shape.openThree || shape.brokenThree)) score += 5_600_000;
  if (shape.closedFour >= 2) score += 2_600_000;
  if (shape.openThree + shape.brokenThree >= 2) score += 520_000;
  return score;
}

function positionalScore(point: Point): number {
  const distance = Math.abs(point.row - BOARD_CENTER) + Math.abs(point.col - BOARD_CENTER);
  return (28 - distance) * 260;
}

function evaluatePoint(board: Cell[][], point: Point, color: Stone): ScoredPoint {
  if (!isLegalMove(board, point, color)) return { ...point, score: -Infinity, policy: 'illegal' };
  const next = applyMove(board, point, color);
  const win = evaluateTerminal(next, { ...point, color, index: 0 });
  if (win.winner === color) return { ...point, score: WIN_SCORE, policy: 'kill-now' };

  const own = analyzeShape(board, point, color);
  const enemy = analyzeShape(board, point, opponent(color));
  const ownScore = shapeScore(own);
  const enemyScore = shapeScore(enemy);
  const pressureBonus = own.openFour || own.closedFour >= 2 ? 1_800_000 : 0;
  const restraintBonus = enemy.openFour || enemy.closedFour >= 2 ? 1_650_000 : 0;
  const score = ownScore * 1.08 + enemyScore * 0.96 + pressureBonus + restraintBonus + positionalScore(point);
  return { ...point, score, policy: ownScore > enemyScore ? 'attack' : 'defense' };
}

function staticBoardScore(board: Cell[][], aiColor: Stone): number {
  let score = 0;
  const candidates = getCandidateMoves(board, 2);
  for (const point of candidates) {
    const own = evaluatePoint(board, point, aiColor).score;
    const enemy = evaluatePoint(board, point, opponent(aiColor)).score;
    if (Number.isFinite(own)) score += own * 0.055;
    if (Number.isFinite(enemy)) score -= enemy * 0.062;
  }
  return score;
}

function tacticalMoves(board: Cell[][], color: Stone, limit: number): ScoredPoint[] {
  const candidates = getCandidateMoves(board, 2)
    .map((point) => evaluatePoint(board, point, color))
    .filter((point) => Number.isFinite(point.score));

  const enemy = opponent(color);
  const enemyKillBlocks = getCandidateMoves(board, 2)
    .filter((point) => isLegalMove(board, point, color))
    .filter((point) => {
      const enemyNext = applyMove(board, point, enemy);
      return evaluateTerminal(enemyNext, { ...point, color: enemy, index: 0 }).winner === enemy;
    })
    .map((point) => ({ ...point, score: WIN_SCORE - 1, policy: 'forced-block' }));

  const merged = new Map<string, ScoredPoint>();
  for (const point of [...candidates, ...enemyKillBlocks]) {
    const key = `${point.row}-${point.col}`;
    const prev = merged.get(key);
    if (!prev || point.score > prev.score) merged.set(key, point);
  }

  return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

function findForcedMove(board: Cell[][], color: Stone): ScoredPoint | null {
  const enemy = opponent(color);
  const ownKill = tacticalMoves(board, color, 20).find((point) => {
    const next = applyMove(board, point, color);
    return evaluateTerminal(next, { ...point, color, index: 0 }).winner === color;
  });
  if (ownKill) return { ...ownKill, policy: 'immediate-win' };

  const enemyKill = tacticalMoves(board, enemy, 20).find((point) => {
    if (!isLegalMove(board, point, color)) return false;
    const next = applyMove(board, point, enemy);
    return evaluateTerminal(next, { ...point, color: enemy, index: 0 }).winner === enemy;
  });
  if (enemyKill) return { ...enemyKill, score: WIN_SCORE - 5, policy: 'must-block' };

  const ownThreat = tacticalMoves(board, color, 12).find((point) => {
    const shape = analyzeShape(board, point, color);
    return shape.openFour || shape.closedFour >= 2 || (shape.openThree + shape.brokenThree >= 2);
  });
  if (ownThreat) return { ...ownThreat, policy: 'forcing-threat' };

  return null;
}

function boardKey(board: Cell[][], color: Stone, depth: number): string {
  return `${color}:${depth}:` + board.map((row) => row.map((cell) => (cell ? cell[0] : '.')).join('')).join('');
}

function minimax(
  board: Cell[][],
  color: Stone,
  aiColor: Stone,
  depth: number,
  alpha: number,
  beta: number,
  startedAt: number,
  options: SearchOptions,
  table: Map<string, number>,
): number {
  if (performance.now() - startedAt > options.timeLimitMs * 0.72) return staticBoardScore(board, aiColor);
  if (depth <= 0) return staticBoardScore(board, aiColor);
  const key = boardKey(board, color, depth);
  const cached = table.get(key);
  if (cached !== undefined) return cached;

  const moves = tacticalMoves(board, color, depth >= 3 ? 9 : 12);
  if (moves.length === 0) return staticBoardScore(board, aiColor);

  let best = color === aiColor ? -Infinity : Infinity;
  for (const move of moves) {
    const next = applyMove(board, move, color);
    const terminal = terminalScore(next, move, color, aiColor, depth);
    const value = terminal ?? minimax(next, opponent(color), aiColor, depth - 1, alpha, beta, startedAt, options, table);
    if (color === aiColor) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, best);
    }
    if (beta <= alpha) break;
  }
  table.set(key, best);
  return best;
}

function weightedRandom(candidates: ScoredPoint[]): ScoredPoint {
  const weights = candidates.map((point) => Math.max(1, Math.log10(Math.max(10, point.score + 10_000))));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < candidates.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return candidates[index];
  }
  return candidates[0];
}

function playout(board: Cell[][], color: Stone, aiColor: Stone, depthLimit: number): number {
  let currentBoard = board;
  let current = color;
  for (let depth = 0; depth < depthLimit; depth += 1) {
    const forced = findForcedMove(currentBoard, current);
    const moves = forced ? [forced] : tacticalMoves(currentBoard, current, 8);
    if (moves.length === 0) return 0;
    const move = forced || weightedRandom(moves);
    currentBoard = applyMove(currentBoard, move, current);
    const terminal = evaluateTerminal(currentBoard, { ...move, color: current, index: 0 });
    if (terminal.winner) return terminal.winner === aiColor ? 1 : -1;
    current = opponent(current);
  }
  const score = staticBoardScore(currentBoard, aiColor);
  return Math.tanh(score / 2_500_000);
}

function mctsRefine(board: Cell[][], color: Stone, candidates: ScoredPoint[], startedAt: number, options: SearchOptions): ScoredPoint {
  if (candidates.length <= 1 || options.mctsPlayouts <= 0) return candidates[0];
  const nodes: MctsNode[] = candidates.slice(0, 8).map((point) => ({ point, wins: 0, visits: 0, prior: Math.max(1, point.score) }));
  let iteration = 0;
  while (iteration < options.mctsPlayouts && performance.now() - startedAt < options.timeLimitMs * 0.96) {
    const totalVisits = nodes.reduce((sum, node) => sum + node.visits, 0) + 1;
    const node = nodes
      .map((item) => ({
        item,
        ucb: item.visits === 0
          ? Infinity
          : item.wins / item.visits + 1.35 * Math.sqrt(Math.log(totalVisits) / item.visits) + Math.log10(item.prior + 10) * 0.015,
      }))
      .sort((a, b) => b.ucb - a.ucb)[0].item;
    const next = applyMove(board, node.point, color);
    const terminal = evaluateTerminal(next, { ...node.point, color, index: 0 });
    const result = terminal.winner
      ? terminal.winner === color ? 1 : -1
      : playout(next, opponent(color), color, 10);
    node.visits += 1;
    node.wins += result;
    iteration += 1;
  }
  return nodes
    .map((node) => ({ ...node.point, score: node.point.score + (node.visits ? (node.wins / node.visits) * 1_800_000 : 0), policy: `${node.point.policy}+mcts` }))
    .sort((a, b) => b.score - a.score)[0];
}

function openingBookMove(board: Cell[][], color: Stone): ScoredPoint | null {
  const stones: Point[] = [];
  board.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    if (cell) stones.push({ row: rowIndex, col: colIndex });
  }));
  if (stones.length === 0 && color === 'black') return { row: 7, col: 7, score: WIN_SCORE, policy: 'tengen' };
  if (stones.length === 1 && color === 'white') {
    const options = [{ row: 6, col: 6 }, { row: 6, col: 7 }, { row: 7, col: 6 }, { row: 8, col: 8 }];
    const legal = options.find((point) => !board[point.row][point.col]);
    return legal ? { ...legal, score: 7_800_000, policy: 'opening-book' } : null;
  }
  if (stones.length === 3 && color === 'white') {
    const options = [{ row: 8, col: 7 }, { row: 7, col: 8 }, { row: 8, col: 8 }, { row: 6, col: 8 }];
    const legal = options.map((point) => evaluatePoint(board, point, color)).filter((point) => Number.isFinite(point.score)).sort((a, b) => b.score - a.score)[0];
    return legal ? { ...legal, score: legal.score + 1_200_000, policy: 'anti-opening' } : null;
  }
  return null;
}

export function chooseAiMove(board: Cell[][], color: Stone, options: Partial<SearchOptions> = {}): ScoredPoint {
  const merged: SearchOptions = { maxDepth: 5, timeLimitMs: 2200, mctsPlayouts: 180, ...options };
  const startedAt = performance.now();

  const forced = findForcedMove(board, color);
  if (forced && forced.score > 600_000) return forced;

  const book = openingBookMove(board, color);
  if (book && isLegalMove(board, book, color)) return book;

  const rootMoves = tacticalMoves(board, color, 18);
  if (rootMoves.length === 0) return { row: 7, col: 7, score: 0, policy: 'fallback' };

  let best = rootMoves[0];
  for (let depth = 1; depth <= merged.maxDepth; depth += 1) {
    if (performance.now() - startedAt > merged.timeLimitMs * 0.68) break;
    const table = new Map<string, number>();
    const searched = rootMoves.slice(0, depth >= 4 ? 10 : 14).map((move) => {
      const next = applyMove(board, move, color);
      const terminal = terminalScore(next, move, color, color, depth);
      const value = terminal ?? minimax(next, opponent(color), color, depth - 1, -Infinity, Infinity, startedAt, merged, table);
      return { ...move, score: value + move.score * 0.018, policy: `${move.policy}+d${depth}` };
    }).sort((a, b) => b.score - a.score);
    if (searched[0]) best = searched[0];
  }

  const refined = mctsRefine(board, color, [best, ...rootMoves.filter((move) => move.row !== best.row || move.col !== best.col)], startedAt, merged);
  return refined.score >= best.score * 0.72 ? refined : best;
}
