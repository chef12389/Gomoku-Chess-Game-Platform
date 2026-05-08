import { CENTER } from './board';
import type { OpeningDefinition } from '../types';

const directNames = ['寒星', '溪月', '疏星', '花月', '残月', '雨月', '金星', '松月', '丘月', '新月', '瑞星', '山月', '游星'];
const diagonalNames = ['长星', '峡月', '恒星', '水月', '流星', '云月', '浦月', '岚月', '银月', '明星', '斜月', '名月', '彗星'];

const directOffsets = [
  [-2, 0], [-2, 1], [-2, 2], [-1, -2], [-1, -1], [-1, 1], [-1, 2],
  [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0],
];

const diagonalOffsets = [
  [-2, -2], [-2, -1], [-1, -2], [-2, 0], [0, -2], [-1, 1], [-2, 2],
  [1, -2], [1, -1], [1, 1], [1, 2], [2, -2], [2, 2],
];

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
    white2: { row: CENTER.row - 1, col: CENTER.col - 1 },
    black3: { row: CENTER.row + diagonalOffsets[index][0], col: CENTER.col + diagonalOffsets[index][1] },
  })),
];

export function isInBlackThreeZone(row: number, col: number): boolean {
  return Math.abs(row - CENTER.row) <= 2 && Math.abs(col - CENTER.col) <= 2;
}
