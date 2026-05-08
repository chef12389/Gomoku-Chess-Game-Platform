import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AppStats, GameRecord, OpeningDefinition, Profile } from '../types';
import { OPENINGS } from './openings';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL as string | undefined)?.toLowerCase() || 'admin@example.com';
export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured ? createClient(url!, anonKey!) : null;

const localRecordsKey = 'renju.local.records';

export function isAdminUser(user?: User | null, profile?: Profile | null): boolean {
  return Boolean(user?.email?.toLowerCase() === adminEmail || profile?.role === 'admin');
}

export async function getCurrentUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase 未配置，无法使用云端登录。');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.user;
}

export async function signUp(email: string, password: string, displayName: string) {
  if (!supabase) throw new Error('Supabase 未配置，无法使用云端注册。');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data.user;
}

export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveGameRecord(record: GameRecord): Promise<void> {
  if (!supabase) {
    const saved = readLocalRecords();
    localStorage.setItem(localRecordsKey, JSON.stringify([record, ...saved]));
    return;
  }
  const { error } = await supabase.from('game_records').insert({
    id: record.id,
    user_id: record.userId || null,
    user_email: record.userEmail || null,
    mode: record.mode,
    player_mode: record.playerMode,
    opening_name: record.openingName || null,
    winner: record.winner || null,
    reason: record.reason || null,
    moves: record.moves,
    duration_seconds: record.durationSeconds,
  });
  if (error) throw error;
}

export function readLocalRecords(): GameRecord[] {
  try {
    return JSON.parse(localStorage.getItem(localRecordsKey) || '[]') as GameRecord[];
  } catch {
    return [];
  }
}

export async function fetchGameRecords(): Promise<GameRecord[]> {
  if (!supabase) return readLocalRecords();
  const { data, error } = await supabase
    .from('game_records')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data || []).map((item) => ({
    id: item.id,
    userId: item.user_id,
    userEmail: item.user_email,
    mode: item.mode,
    playerMode: item.player_mode,
    openingName: item.opening_name,
    winner: item.winner,
    reason: item.reason,
    moves: item.moves,
    createdAt: item.created_at,
    durationSeconds: item.duration_seconds,
  }));
}

export async function fetchProfiles(): Promise<Profile[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function deleteGameRecord(id: string): Promise<void> {
  if (!supabase) {
    localStorage.setItem(localRecordsKey, JSON.stringify(readLocalRecords().filter((record) => record.id !== id)));
    return;
  }
  const { error } = await supabase.from('game_records').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchOpenings(): Promise<OpeningDefinition[]> {
  if (!supabase) return OPENINGS;
  const { data, error } = await supabase.from('openings').select('*').order('id');
  if (error || !data?.length) return OPENINGS;
  return data.map((item) => ({
    id: item.id,
    name: item.name,
    family: item.family,
    black1: item.black1,
    white2: item.white2,
    black3: item.black3,
  }));
}

export async function fetchStats(): Promise<AppStats> {
  const [profiles, records] = await Promise.all([fetchProfiles().catch(() => []), fetchGameRecords().catch(() => [])]);
  const aiRecords = records.filter((record) => record.playerMode === 'ai');
  const aiWins = aiRecords.filter((record) => record.winner === 'white').length;
  const openingCounts = new Map<string, number>();
  for (const record of records) {
    if (record.openingName) openingCounts.set(record.openingName, (openingCounts.get(record.openingName) || 0) + 1);
  }
  const popularOpening = [...openingCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '暂无数据';
  return {
    userCount: profiles.length,
    matchCount: records.length,
    aiWinRate: aiRecords.length ? Math.round((aiWins / aiRecords.length) * 100) : 0,
    popularOpening,
  };
}
