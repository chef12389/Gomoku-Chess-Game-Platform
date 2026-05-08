import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { fetchProfile, getCurrentUser, isAdminUser, isSupabaseConfigured, supabase } from '../lib/supabase';
import type { Profile } from '../types';

interface AuthContextValue {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  isAdmin: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!isSupabaseConfigured) {
      setUser(null);
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const current = await getCurrentUser();
    setUser(current);
    setProfile(current ? await fetchProfile(current.id).catch(() => null) : null);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
    if (!supabase) return undefined;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo(
    () => ({ user, profile, loading, isAdmin: isAdminUser(user, profile), refresh }),
    [user, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
