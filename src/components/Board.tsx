import { useEffect, useMemo, useState } from 'react';
import type { Cell, Move, Point, Stone } from '../types';
import { BOARD_SIZE, pointKey } from '../lib/board';

interface BoardProps {
  board: Cell[][];
  nextColor: Stone;
  moves: Move[];
  winningLine: Point[];
  suggestedPoints?: Array<Point & { label?: string; color?: Stone }>;
  disabled?: boolean;
  readOnly?: boolean;
  onPlace?: (point: Point) => void;
}

export function Board({ board, nextColor, moves, winningLine, suggestedPoints = [], disabled, readOnly, onPlace }: BoardProps) {
  const [pendingPoint, setPendingPoint] = useState<Point | null>(null);
  const last = moves[moves.length - 1];
  const winning = new Set(winningLine.map(pointKey));
  const isCoarsePointer = useMemo(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(hover: none), (pointer: coarse)').matches;
  }, []);
  const letters = 'ABCDEFGHIJKLMNO'.split('');
  const points = Array.from({ length: BOARD_SIZE }, (_, index) => (index / (BOARD_SIZE - 1)) * 100);
  const starPoints = [
    { row: 3, col: 3 },
    { row: 3, col: 11 },
    { row: 7, col: 7 },
    { row: 11, col: 3 },
    { row: 11, col: 11 },
  ];

  useEffect(() => {
    setPendingPoint(null);
  }, [moves.length, disabled]);

  const confirmPendingPlace = () => {
    if (!pendingPoint || disabled || readOnly || !onPlace) return;
    const cell = board[pendingPoint.row][pendingPoint.col];
    if (cell) {
      setPendingPoint(null);
      return;
    }
    const point = pendingPoint;
    setPendingPoint(null);
    onPlace(point);
  };

  const handlePlace = (point: Point, occupied: boolean) => {
    if (disabled || readOnly || occupied || !onPlace) return;
    if (!isCoarsePointer) {
      onPlace(point);
      return;
    }
    setPendingPoint(point);
  };

  return (
    <div className={`board-case ${readOnly ? 'board-readonly' : ''}`}>
      <div className="board-shell">
        <div className="board-coords top" aria-hidden="true">
          {letters.map((letter) => <span key={letter}>{letter}</span>)}
        </div>
        <div className="board-coords bottom" aria-hidden="true">
          {letters.map((letter) => <span key={letter}>{letter}</span>)}
        </div>
        <div className="board-coords left" aria-hidden="true">
          {Array.from({ length: BOARD_SIZE }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>
        <div className="board-coords right" aria-hidden="true">
          {Array.from({ length: BOARD_SIZE }, (_, index) => <span key={index}>{index + 1}</span>)}
        </div>

        <svg className="board-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {points.map((value) => (
            <line key={`v-${value}`} x1={value} y1="0" x2={value} y2="100" vectorEffect="non-scaling-stroke" />
          ))}
          {points.map((value) => (
            <line key={`h-${value}`} x1="0" y1={value} x2="100" y2={value} vectorEffect="non-scaling-stroke" />
          ))}
          {starPoints.map((point) => (
            <circle
              key={`${point.row}-${point.col}`}
              cx={(point.col / (BOARD_SIZE - 1)) * 100}
              cy={(point.row / (BOARD_SIZE - 1)) * 100}
              r="0.82"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <div className="board-grid" role="grid" aria-label="十五乘十五五子棋棋盘">
          {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
            const row = Math.floor(index / BOARD_SIZE);
            const col = index % BOARD_SIZE;
            const cell = board[row][col];
            const isLast = last?.row === row && last?.col === col;
            const isWin = winning.has(pointKey({ row, col }));
            const suggestion = suggestedPoints.find((point) => point.row === row && point.col === col);
            const isPending = pendingPoint?.row === row && pendingPoint.col === col;
            return (
              <button
                key={`${row}-${col}`}
                className={`board-cell ${isPending ? 'board-cell-pending' : ''} ${disabled || readOnly ? 'cursor-not-allowed' : ''}`}
                style={{ left: `${(col / (BOARD_SIZE - 1)) * 100}%`, top: `${(row / (BOARD_SIZE - 1)) * 100}%` }}
                onClick={() => handlePlace({ row, col }, Boolean(cell))}
                disabled={disabled || readOnly || Boolean(cell)}
                aria-label={`${row + 1} 行 ${col + 1} 列${cell ? ` ${cell === 'black' ? '黑棋' : '白棋'}` : ' 空位'}`}
              >
                {suggestion && !cell && (
                  <span className={`suggested-point ${suggestion.color || nextColor}`}>
                    {suggestion.label}
                  </span>
                )}
                {isPending && !cell && !disabled && (
                  <span className={`pending-stone ${nextColor}`}>
                    <span
                      className={`confirm-place-button ${row >= 13 ? 'confirm-place-button--above' : ''}`}
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        confirmPendingPlace();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          confirmPendingPlace();
                        }
                      }}
                    >
                      确认
                    </span>
                  </span>
                )}
                {!cell && !disabled && !readOnly && <span className={`ghost-stone ${nextColor}`} />}
                {cell && (
                  <span className={`stone ${cell} ${isLast ? 'last-stone' : ''} ${isWin ? 'win-stone' : ''}`}>
                    {isLast && <span className="last-dot" />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
