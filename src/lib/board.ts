import type { Cell, ForbiddenResult, Move, Point, Stone, WinResult } from '../types';

export const BOARD_SIZE = 15;
export const CENTER: Point = { row: 7, col: 7 };
export const DIRECTIONS: Point[] = [
  { row: 0, col: 1 },
  { row: 1, col: 0 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
];

export function createBoard(): Cell[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array<Cell>(BOARD_SIZE).fill(null));
}

export function cloneBoard(board: Cell[][]): Cell[][] {
  return board.map((row) => [...row]);
}

export function isInside(point: Point): boolean {
  return point.row >= 0 && point.row < BOARD_SIZE && point.col >= 0 && point.col < BOARD_SIZE;
}

export function pointKey(point: Point): string {
  return `${point.row}-${point.col}`;
}

export function samePoint(a: Point, b: Point): boolean {
  return a.row === b.row && a.col === b.col;
}

export function opponent(color: Stone): Stone {
  return color === 'black' ? 'white' : 'black';
}

export function applyMove(board: Cell[][], move: Point, color: Stone): Cell[][] {
  const next = cloneBoard(board);
  next[move.row][move.col] = color;
  return next;
}

export function countInDirection(board: Cell[][], point: Point, color: Stone, direction: Point): Point[] {
  const line: Point[] = [];
  let cursor = { row: point.row + direction.row, col: point.col + direction.col };
  while (isInside(cursor) && board[cursor.row][cursor.col] === color) {
    line.push(cursor);
    cursor = { row: cursor.row + direction.row, col: cursor.col + direction.col };
  }
  return line;
}

export function getLineThrough(board: Cell[][], point: Point, color: Stone, direction: Point): Point[] {
  const backward = countInDirection(board, point, color, { row: -direction.row, col: -direction.col }).reverse();
  const forward = countInDirection(board, point, color, direction);
  return [...backward, point, ...forward];
}

function hasExactFive(board: Cell[][], point: Point, color: Stone): Point[] {
  for (const direction of DIRECTIONS) {
    const line = getLineThrough(board, point, color, direction);
    if (line.length === 5) return line;
  }
  return [];
}

function hasOverline(board: Cell[][], point: Point, color: Stone): Point[] {
  for (const direction of DIRECTIONS) {
    const line = getLineThrough(board, point, color, direction);
    if (line.length > 5) return line;
  }
  return [];
}

function wouldMakeExactFive(board: Cell[][], point: Point, color: Stone, direction: Point): boolean {
  if (!isInside(point) || board[point.row][point.col]) return false;
  const next = applyMove(board, point, color);
  return getLineThrough(next, point, color, direction).length === 5;
}

function winningExtensionsInDirection(board: Cell[][], point: Point, color: Stone, direction: Point): Point[] {
  const extensions: Point[] = [];
  for (let step = -5; step <= 5; step += 1) {
    if (step === 0) continue;
    const cursor = { row: point.row + direction.row * step, col: point.col + direction.col * step };
    if (wouldMakeExactFive(board, cursor, color, direction)) extensions.push(cursor);
  }
  return extensions;
}

function hasOpenFourInDirection(board: Cell[][], point: Point, color: Stone, direction: Point): boolean {
  return winningExtensionsInDirection(board, point, color, direction).length >= 2;
}

function countOpenThreeDirections(board: Cell[][], point: Point, color: Stone): number {
  let total = 0;
  for (const direction of DIRECTIONS) {
    let found = false;
    for (let step = -4; step <= 4; step += 1) {
      if (step === 0) continue;
      const cursor = { row: point.row + direction.row * step, col: point.col + direction.col * step };
      if (!isInside(cursor) || board[cursor.row][cursor.col]) continue;
      const next = applyMove(board, cursor, color);
      const line = getLineThrough(next, cursor, color, direction);
      if (line.length > 4) continue;
      if (hasOpenFourInDirection(next, cursor, color, direction)) {
        found = true;
        break;
      }
    }
    if (found) total += 1;
  }
  return total;
}

function countFourDirections(board: Cell[][], point: Point, color: Stone): number {
  let total = 0;
  for (const direction of DIRECTIONS) {
    if (winningExtensionsInDirection(board, point, color, direction).length > 0) total += 1;
  }
  return total;
}

function directionalText(board: Cell[][], point: Point, color: Stone, direction: Point): string {
  const chars: string[] = [];
  for (let step = -5; step <= 5; step += 1) {
    const cursor = { row: point.row + direction.row * step, col: point.col + direction.col * step };
    if (!isInside(cursor)) {
      chars.push('x');
    } else {
      const cell = board[cursor.row][cursor.col];
      chars.push(cell === color ? '1' : cell === null ? '0' : '2');
    }
  }
  return chars.join('');
}

function countPatternOpenThrees(board: Cell[][], point: Point, color: Stone): number {
  let total = 0;
  const patterns = [/01110/, /010110/, /011010/, /0101110/, /0111010/];
  for (const direction of DIRECTIONS) {
    const text = directionalText(board, point, color, direction);
    const found = patterns.some((pattern) => pattern.test(text));
    if (found) total += 1;
  }
  return total;
}

function countPatternFours(board: Cell[][], point: Point, color: Stone): number {
  let total = 0;
  const patterns = [/011110/, /211110/, /011112/, /10111/, /11011/, /11101/, /01111/, /11110/];
  for (const direction of DIRECTIONS) {
    const text = directionalText(board, point, color, direction);
    const found = patterns.some((pattern) => pattern.test(text));
    if (found) total += 1;
  }
  return total;
}

export function detectForbidden(board: Cell[][], point: Point): ForbiddenResult {
  const color = 'black';
  if (board[point.row][point.col] !== color) {
    return { isForbidden: false, overline: false, doubleThree: false, doubleFour: false, openThrees: 0, fours: 0 };
  }
  if (hasExactFive(board, point, color).length === 5) {
    return { isForbidden: false, overline: false, doubleThree: false, doubleFour: false, openThrees: 0, fours: 0 };
  }
  const overline = hasOverline(board, point, color).length > 0;
  const openThrees = Math.max(countOpenThreeDirections(board, point, color), countPatternOpenThrees(board, point, color));
  const fours = Math.max(countFourDirections(board, point, color), countPatternFours(board, point, color));
  const doubleThree = openThrees >= 2;
  const doubleFour = fours >= 2;
  const reasons = [
    overline ? '长连禁手' : '',
    doubleThree ? '三三禁手' : '',
    doubleFour ? '四四禁手' : '',
  ].filter(Boolean);
  return {
    isForbidden: overline || doubleThree || doubleFour,
    overline,
    doubleThree,
    doubleFour,
    openThrees,
    fours,
    reason: reasons.join('、'),
  };
}

export function evaluateTerminal(board: Cell[][], lastMove?: Move): WinResult {
  if (!lastMove) return { winner: null, line: [] };
  const exactFive = hasExactFive(board, lastMove, lastMove.color);
  if (exactFive.length === 5) {
    return { winner: lastMove.color, reason: 'five', line: exactFive };
  }
  const overline = hasOverline(board, lastMove, lastMove.color);
  if (overline.length > 5 && lastMove.color === 'white') {
    return { winner: 'white', reason: 'white-overline', line: overline };
  }
  if (lastMove.color === 'black') {
    const forbidden = detectForbidden(board, lastMove);
    if (forbidden.isForbidden) {
      return { winner: 'white', reason: 'black-forbidden', line: overline, forbidden };
    }
  }
  if (board.every((row) => row.every(Boolean))) {
    return { winner: null, reason: 'draw', line: [] };
  }
  return { winner: null, line: [] };
}

export function getCandidateMoves(board: Cell[][], radius = 2): Point[] {
  const occupied: Point[] = [];
  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) occupied.push({ row: rowIndex, col: colIndex });
    });
  });
  if (occupied.length === 0) return [CENTER];
  const map = new Map<string, Point>();
  for (const stone of occupied) {
    for (let dr = -radius; dr <= radius; dr += 1) {
      for (let dc = -radius; dc <= radius; dc += 1) {
        const point = { row: stone.row + dr, col: stone.col + dc };
        if (isInside(point) && !board[point.row][point.col]) map.set(pointKey(point), point);
      }
    }
  }
  return [...map.values()];
}

export function serializeMoves(moves: Move[]): string {
  const files = 'ABCDEFGHIJKLMNO';
  return moves.map((move) => `${move.index}.${move.color === 'black' ? '黑' : '白'} ${files[move.col]}${BOARD_SIZE - move.row}`).join(' ');
}
