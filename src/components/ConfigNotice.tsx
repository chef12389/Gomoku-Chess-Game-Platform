import { AlertTriangle } from 'lucide-react';
import { isSupabaseConfigured } from '../lib/supabase';

export function ConfigNotice() {
  if (isSupabaseConfigured) return null;
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <AlertTriangle className="mt-0.5 shrink-0" size={18} />
      <p>
        当前未配置 Supabase。对局可本地运行，棋谱会保存在本浏览器；登录、注册和云端后台需要填写
        <span className="font-semibold"> VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_ADMIN_EMAIL</span>。
      </p>
    </div>
  );
}
