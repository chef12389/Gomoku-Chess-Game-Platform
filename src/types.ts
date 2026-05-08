export type Stone = 'black' | 'white';
export type Cell = Stone | null;
export type PlayerMode = 'ai' | 'local';
export type OpeningMode = 'free' | 'standard';
export type GamePhase = 'playing' | 'swap-offer' | 'n-move' | 'finished';
export type ResultReason = 'five' | 'white-overline' | 'black-forbidden' | 'resign' | 'timeout' | 'draw';

export interface Point {
  row: number;
  col: number;
}

export interface Move extends Point {
  color: Stone;
  index: number;
  forbidden?: ForbiddenResult;
  aiScore?: number;
}

export interface ForbiddenResult {
  isForbidden: boolean;
  overline: boolean;
  doubleThree: boolean;
  doubleFour: boolean;
  openThrees: number;
  fours: number;
  reason?: string;
}

export interface WinResult {
  winner: Stone | null;
  reason?: ResultReason;
  line: Point[];
  forbidden?: ForbiddenResult;
}

export interface GameRecord {
  id: string;
  userId?: string;
  userEmail?: string;
  mode: OpeningMode;
  playerMode: PlayerMode;
  openingName?: string;
  winner?: Stone | 'draw';
  reason?: string;
  moves: Move[];
  createdAt: string;
  durationSeconds: number;
}

export interface OpeningDefinition {
  id: string;
  name: string;
  family: 'direct' | 'diagonal';
  black1: Point;
  white2: Point;
  black3: Point;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  created_at: string;
}

export interface AppStats {
  userCount: number;
  matchCount: number;
  aiWinRate: number;
  popularOpening: string;
}
