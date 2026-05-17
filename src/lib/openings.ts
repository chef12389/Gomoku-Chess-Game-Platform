import { CENTER } from './board';
import type { Cell, OpeningDefinition, Point, Stone } from '../types';

const directNames = ['残月', '瑞星', '雨月', '疏星', '松月', '新月', '花月', '寒星', '丘月', '山月', '金星', '溪月', '游星'];
const diagonalNames = ['斜月', '名月', '恒星', '岚月', '明星', '峡月', '长星', '浦月', '云月', '水月', '银月', '流星', '彗星'];

const directOffsets = [
  [-1, 2], [2, 0], [0, 1], [-2, 2], [1, 0], [1, 2], [-1, 1],
  [-2, 0], [1, 1], [2, 1], [0, 2], [-2, 1], [2, 2],
];

const diagonalOffsets = [
  [1, -1], [2, -1], [0, 2], [2, 1], [2, 0], [-1, 2], [-2, 2],
  [1, 1], [0, 1], [1, 2], [1, 0], [2, 2], [3, -2],
];

const balancedNames = new Set(['疏星', '瑞星', '丘月', '松月', '斜月']);
const mustSwapNames = new Set(['花月', '浦月', '寒星', '溪月', '恒星']);
const badForBlackNames = new Set(['彗星', '游星']);

function baseName(name: string): string {
  return name.replace(/^直指 |^斜指 /, '');
}

export const OPENINGS: OpeningDefinition[] = [
  ...directNames.map((name, index) => ({
    id: `direct-${index + 1}`,
    name: `直指 ${name}`,
    family: 'direct' as const,
    black1: CENTER,
    white2: { row: CENTER.row - 1, col: CENTER.col },
    black3: { row: CENTER.row + directOffsets[index][0], col: CENTER.col + directOffsets[index][1] },
  })),
  ...diagonalNames.map((name, index) => ({
    id: `diagonal-${index + 1}`,
    name: `斜指 ${name}`,
    family: 'diagonal' as const,
    black1: CENTER,
    white2: { row: CENTER.row - 1, col: CENTER.col + 1 },
    black3: { row: CENTER.row + diagonalOffsets[index][0], col: CENTER.col + diagonalOffsets[index][1] },
  })),
];

export const RECOMMENDED_OPENING_IDS = OPENINGS
  .filter((opening) => balancedNames.has(baseName(opening.name)))
  .map((opening) => opening.id);

export function isBalancedOpening(name: string): boolean {
  return balancedNames.has(baseName(name));
}

export function shouldSwapOpening(name: string): boolean {
  return mustSwapNames.has(baseName(name));
}

export function isBadOpening(name: string): boolean {
  return badForBlackNames.has(baseName(name));
}

export function openingStrategyLabel(name: string): string {
  if (isBalancedOpening(name)) return '推荐平衡';
  if (shouldSwapOpening(name)) return '白方应交换';
  if (isBadOpening(name)) return '黑方不利';
  return '谨慎使用';
}

export function isInBlackThreeZone(row: number, col: number): boolean {
  return Math.abs(row - CENTER.row) <= 2 && Math.abs(col - CENTER.col) <= 2;
}

export function selectBalancedOpening(): OpeningDefinition {
  const preferred = ['直指 疏星', '直指 瑞星', '直指 丘月', '直指 松月', '斜指 斜月'];
  return preferred.map((name) => OPENINGS.find((opening) => opening.name === name)).find(Boolean) || OPENINGS[0];
}

export function selectAiOpening(): OpeningDefinition {
  const pool = OPENINGS.filter((opening) => isBalancedOpening(opening.name));
  return pool[Math.floor(Math.random() * pool.length)] || selectBalancedOpening();
}

export function recommendNForSide(side: Stone): number {
  return side === 'black' ? 2 : 5;
}

export function recommendNForOpponent(strength: 'normal' | 'strong'): number {
  return strength === 'strong' ? 4 : 3;
}

function scorePointForBlack(board: Cell[][], point: Point): number {
  const stones: Array<Point & { color: Stone }> = [];
  board.forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      if (cell) stones.push({ row: rowIndex, col: colIndex, color: cell });
    });
  });

  const centerDistance = Math.abs(point.row - CENTER.row) + Math.abs(point.col - CENTER.col);
  const edgeDistance = Math.min(point.row, point.col, 14 - point.row, 14 - point.col);
  const blackNear = stones.filter((stone) => stone.color === 'black' && Math.max(Math.abs(stone.row - point.row), Math.abs(stone.col - point.col)) <= 2).length;
  const whiteNear = stones.filter((stone) => stone.color === 'white' && Math.max(Math.abs(stone.row - point.row), Math.abs(stone.col - point.col)) <= 2).length;

  return (14 - centerDistance) * 20 + edgeDistance * 35 + blackNear * 140 - whiteNear * 35;
}

export function createNMoveCandidates(board: Cell[][], n: number): Point[] {
  const pool: Point[] = [
    { row: 6, col: 8 },
    { row: 8, col: 6 },
    { row: 5, col: 9 },
    { row: 9, col: 5 },
    { row: 8, col: 9 },
    { row: 5, col: 7 },
    { row: 7, col: 5 },
    { row: 9, col: 7 },
  ];

  const legal = pool.filter((point) => !board[point.row][point.col]);
  const ordered = legal.sort((a, b) => scorePointForBlack(board, b) - scorePointForBlack(board, a));
  const target = Math.max(2, Math.min(5, n));
  if (target <= 2) return [ordered[0], ordered[Math.min(ordered.length - 1, 3)]].filter(Boolean);
  return ordered.slice(0, target);
}
