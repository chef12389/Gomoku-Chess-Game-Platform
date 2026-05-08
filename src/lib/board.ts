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

function scanWindow(line: string, placedOffset: number, pattern: RegExp): number {
  let count = 0;
  for (let start = 0; start < line.length; start += 1) {
    pattern.lastIndex = start;
    const match = pattern.exec(line);
    if (!match) break;
    const from = match.index;
    const to = from + match[0].length - 1;
    if (placedOffset >= from && placedOffset <= to) count += 1;
    start = match.index;
  }
  return count;
}

function directionalText(board: Cell[][], point: Point, color: Stone, direction: Point): { text: string; offset: number } {
  const chars: string[] = [];
  let offset = 0;
  for (let step = -5; step <= 5; step += 1) {
    const cursor = { row: point.row + direction.row * step, col: point.col + direction.col * step };
    if (step === 0) offset = chars.length;
    if (!isInside(cursor)) {
      chars.push('x');
    } else {
      const cell = board[cursor.row][cursor.col];
      chars.push(cell === color ? '1' : cell === null ? '0' : '2');
    }
  }
  return { text: chars.join(''), offset };
}

function countOpenThrees(board: Cell[][], point: Point, color: Stone): number {
  let total = 0;
  const patterns = [/01110/g, /010110/g, /011010/g];
  for (const direction of DIRECTIONS) {
    const { text, offset } = directionalText(board, point, color, direction);
    const found = patterns.some((pattern) => scanWindow(text, offset, pattern) > 0);
    if (found) total += 1;
  }
  return total;
}

function countFours(board: Cell[][], point: Point, color: Stone): number {
  let total = 0;
  const patterns = [/011110/g, /211110/g, /011112/g, /10111/g, /11011/g, /11101/g, /01111/g, /11110/g];
  for (const direction of DIRECTIONS) {
    const { text, offset } = directionalText(board, point, color, direction);
    const found = patterns.some((pattern) => scanWindow(text, offset, pattern) > 0);
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
  const overline = hasOverline(board, point, color).length > 5;
  const openThrees = countOpenThrees(board, point, color);
  const fours = countFours(board, point, color);
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
  return moves.map((move) => `${move.index}.${move.color[0]}(${move.row + 1},${move.col + 1})`).join(' ');
}
