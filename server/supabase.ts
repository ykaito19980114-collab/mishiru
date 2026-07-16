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

export async function deleteMishiruIdentity(userId: string | null, sessionId: string) {
  const supabase = serverSupabase();
  if (!supabase) return;
  const deleteBySession = async (table: string) => {
    const { error } = await supabase.from(table).delete().eq("session_id", sessionId);
    if (error) throw new Error(`ACCOUNT_DELETE_FAILED:${table}:${error.message}`);
  };
  for (const table of [
    "mishiru_guest_usage_events",
    "mishiru_guest_usage",
    "mishiru_card_actions",
    "mishiru_interest_profiles",
    "mishiru_events",
    "mishiru_session_state",
  ]) await deleteBySession(table);
  if (!userId) return;
  const { error: linkError } = await supabase.from("mishiru_user_sessions").delete().eq("user_id", userId);
  if (linkError) throw new Error(`ACCOUNT_DELETE_FAILED:mishiru_user_sessions:${linkError.message}`);
  const { error: userError } = await supabase.auth.admin.deleteUser(userId);
  if (userError && !/not found/i.test(userError.message)) throw new Error(`ACCOUNT_DELETE_FAILED:auth.users:${userError.message}`);
}
