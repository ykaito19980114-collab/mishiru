import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

let client: SupabaseClient | null | undefined;

export function serverSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  client = url && key
    ? createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    : null;
  return client;
}

export function supabasePersistenceEnabled(): boolean {
  return Boolean(serverSupabase());
}

export async function userFromBearer(value?: string | null): Promise<User | null> {
  const token = value?.match(/^Bearer\s+(.+)$/i)?.[1];
  const supabase = serverSupabase();
  if (!token || !supabase) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user || null;
}
