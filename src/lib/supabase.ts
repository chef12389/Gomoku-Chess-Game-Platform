import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { createBoard } from './board';
import type { AppStats, GameRecord, Move, OnlineChatMessage, OnlineRoom, Profile, Stone } from '../types';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase() || 'admin@example.com';
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

const localRecordsKey = 'renju.local.records';
const localAdminKey = 'renju.local.admin';
const builtInAdminEmail = 'admin@example.com';
const builtInAdminPassword = 'admin123456';

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `record-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function localAdminUser(): User {
  return {
    id: 'local-admin',
    email: builtInAdminEmail,
    app_metadata: {},
    user_metadata: { display_name: '管理员' },
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
  } as User;
}

function localAdminProfile(): Profile {
  return {
    id: 'local-admin',
    email: builtInAdminEmail,
    display_name: '管理员',
    role: 'admin',
    created_at: new Date(0).toISOString(),
  };
}

function isLocalAdminSession(): boolean {
  return localStorage.getItem(localAdminKey) === 'true';
}

function withTimeout<T>(promise: Promise<T>, ms = 3500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('云端响应超时，已改用本地保存。')), ms);
    promise
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => window.clearTimeout(timer));
  });
}

function saveLocalRecord(record: GameRecord): void {
  const saved = readLocalRecords().filter((item) => item.id !== record.id);
  localStorage.setItem(localRecordsKey, JSON.stringify([{ ...record, id: record.id || makeId() }, ...saved]));
}

export function isAdminUser(user?: User | null, profile?: Profile | null): boolean {
  return Boolean(user?.email?.toLowerCase() === adminEmail || profile?.role === 'admin');
}

export async function getCurrentUser(): Promise<User | null> {
  if (isLocalAdminSession()) return localAdminUser();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signIn(email: string, password: string) {
  if (email.trim().toLowerCase() === builtInAdminEmail && password === builtInAdminPassword) {
    localStorage.setItem(localAdminKey, 'true');
    return localAdminUser();
  }
  if (!supabase) throw new Error('云端登录未配置。');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('云端注册未配置。');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  localStorage.removeItem(localAdminKey);
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (userId === 'local-admin') return localAdminProfile();
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export function saveGameRecord(record: GameRecord): 'local' {
  saveLocalRecord(record);
  if (supabase) {
    void withTimeout(
      Promise.resolve(supabase.from('game_records').insert({
        id: record.id,
        user_id: record.userId === 'local-admin' ? null : record.userId || null,
        user_email: record.userEmail || null,
        mode: record.mode,
        player_mode: record.playerMode,
        winner: record.winner || null,
        reason: record.reason || null,
        moves: record.moves,
        duration_seconds: record.durationSeconds,
      })),
    ).catch(() => undefined);
  }
  return 'local';
}

export function readLocalRecords(): GameRecord[] {
  try {
    return JSON.parse(localStorage.getItem(localRecordsKey) || '[]') as GameRecord[];
  } catch {
    return [];
  }
}

export function fetchLocalGameRecords(): GameRecord[] {
  return readLocalRecords().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function fetchGameRecords(): Promise<GameRecord[]> {
  const local = fetchLocalGameRecords();
  if (!supabase) return local;
  const { data, error } = await supabase
    .from('game_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return local;
  const cloud = (data || []).map((item) => ({
    id: item.id,
    userId: item.user_id,
    userEmail: item.user_email,
    mode: item.mode,
    playerMode: item.player_mode,
    winner: item.winner,
    reason: item.reason,
    moves: item.moves,
    createdAt: item.created_at,
    durationSeconds: item.duration_seconds,
    moveTimeLimitSeconds: null,
  }));
  const merged = new Map<string, GameRecord>();
  [...cloud, ...local].forEach((record) => merged.set(record.id, record));
  return [...merged.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function fetchProfiles(): Promise<Profile[]> {
  if (!supabase) return isLocalAdminSession() ? [localAdminProfile()] : [];
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  const profiles = data || [];
  if (isLocalAdminSession() && !profiles.some((profile) => profile.id === 'local-admin')) {
    return [localAdminProfile(), ...profiles];
  }
  return profiles;
}

export async function deleteGameRecord(id: string): Promise<void> {
  localStorage.setItem(localRecordsKey, JSON.stringify(readLocalRecords().filter((record) => record.id !== id)));
  if (!supabase) return;
  await supabase.from('game_records').delete().eq('id', id);
}

export async function fetchStats(): Promise<AppStats> {
  const [profiles, records] = await Promise.all([fetchProfiles().catch(() => []), fetchGameRecords().catch(() => [])]);
  const aiRecords = records.filter((record) => record.playerMode === 'ai');
  const aiWins = aiRecords.filter((record) => record.winner === 'white').length;
  return {
    userCount: profiles.length,
    matchCount: records.length,
    aiWinRate: aiRecords.length ? Math.round((aiWins / aiRecords.length) * 100) : 0,
  };
}

function makeRoomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function cloudUserId(userId: string | undefined): string | null {
  return userId && userId !== 'local-admin' ? userId : null;
}

function mapRoom(item: any): OnlineRoom {
  return {
    id: item.id,
    code: item.code,
    host_id: item.host_id,
    guest_id: item.guest_id,
    host_email: item.host_email,
    guest_email: item.guest_email,
    host_color: item.host_color,
    status: item.status,
    board: item.board,
    moves: item.moves || [],
    chat_messages: item.chat_messages || [],
    next_color: item.next_color,
    winner: item.winner,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

export async function createOnlineRoom(userId: string | undefined, email: string | undefined, hostColor: Stone): Promise<OnlineRoom> {
  if (!supabase) throw new Error('线上对弈需要先配置 Supabase。');
  const code = makeRoomCode();
  const { data, error } = await supabase
    .from('online_rooms')
    .insert({
      code,
      host_id: cloudUserId(userId),
      host_email: email || '访客',
      host_color: hostColor,
      status: 'waiting',
      board: createBoard(),
      moves: [],
      next_color: 'black',
    })
    .select('*')
    .single();
  if (error) throw error;
  return mapRoom(data);
}

export async function joinOnlineRoom(code: string, userId: string | undefined, email: string | undefined): Promise<OnlineRoom> {
  if (!supabase) throw new Error('线上对弈需要先配置 Supabase。');
  const normalized = code.trim().toUpperCase();
  const { data: room, error: fetchError } = await supabase.from('online_rooms').select('*').eq('code', normalized).maybeSingle();
  if (fetchError) throw fetchError;
  if (!room) throw new Error('未找到该房间。');
  const { data, error } = await supabase
    .from('online_rooms')
    .update({
      guest_id: cloudUserId(userId),
      guest_email: email || '访客',
      status: 'playing',
    })
    .eq('id', room.id)
    .select('*')
    .single();
  if (error) throw error;
  return mapRoom(data);
}

export async function fetchOnlineRoom(roomId: string): Promise<OnlineRoom | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('online_rooms').select('*').eq('id', roomId).maybeSingle();
  if (error) throw error;
  return data ? mapRoom(data) : null;
}

export async function updateOnlineRoomMove(room: OnlineRoom, board: unknown, moves: Move[], nextColor: Stone, winner: Stone | 'draw' | null): Promise<void> {
  if (!supabase) throw new Error('线上对弈需要先配置 Supabase。');
  const { error } = await supabase
    .from('online_rooms')
    .update({
      board,
      moves,
      next_color: nextColor,
      winner,
      status: winner ? 'finished' : 'playing',
      updated_at: new Date().toISOString(),
    })
    .eq('id', room.id);
  if (error) throw error;
}

export async function sendOnlineRoomMessage(
  roomId: string,
  message: Omit<OnlineChatMessage, 'id' | 'created_at'>,
): Promise<OnlineChatMessage[]> {
  if (!supabase) throw new Error('线上互动需要先配置 Supabase。');
  const latest = await fetchOnlineRoom(roomId);
  if (!latest) throw new Error('房间不存在或已失效。');
  const nextMessage: OnlineChatMessage = {
    ...message,
    id: makeId(),
    text: message.text.trim().slice(0, 180),
    created_at: new Date().toISOString(),
  };
  const chatMessages = [...(latest.chat_messages || []), nextMessage].slice(-80);
  const { error } = await supabase
    .from('online_rooms')
    .update({
      chat_messages: chatMessages,
      updated_at: new Date().toISOString(),
    })
    .eq('id', roomId);
  if (error) throw error;
  return chatMessages;
}
