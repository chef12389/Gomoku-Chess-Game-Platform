import { chooseAiMove } from './ai';
import type { Cell, Stone } from '../types';

interface AiWorkerRequest {
  id: number;
  board: Cell[][];
  color: Stone;
  maxDepth: number;
}

self.onmessage = (event: MessageEvent<AiWorkerRequest>) => {
  const { id, board, color, maxDepth } = event.data;
  const startedAt = performance.now();
  const move = chooseAiMove(board, color, { maxDepth, timeLimitMs: 0 });
  const elapsedMs = Math.round(performance.now() - startedAt);
  self.postMessage({ id, move, elapsedMs });
};
