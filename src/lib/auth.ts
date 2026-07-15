import { createClient, type Session } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const client = url && anonKey ? createClient(url, anonKey) : null;
const DEV_USER_KEY = "mishiru_dev_user";

export const authConfigured = !!client || import.meta.env.DEV;

export async function authHeaders(): Promise<Record<string, string>> {
  if (client) {
    const { data } = await client.auth.getSession();
    if (data.session?.access_token) return { Authorization: `Bearer ${data.session.access_token}` };
  }
  const devUser = import.meta.env.DEV ? localStorage.getItem(DEV_USER_KEY) : null;
  return devUser ? { "x-mishiru-dev-user": devUser } : {};
}

export async function currentSession(): Promise<Session | null> {
  if (!client) return null;
  return (await client.auth.getSession()).data.session;
}

export async function signUp(email: string, password: string) {
  if (!client) {
    if (!import.meta.env.DEV) throw new Error("アカウント機能の設定が完了していません");
    localStorage.setItem(DEV_USER_KEY, `dev-${email.toLowerCase()}`);
    window.dispatchEvent(new Event("mishiru:auth-changed"));
    return { needsEmailConfirmation: false };
  }
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  if (!client) {
    if (!import.meta.env.DEV) throw new Error("アカウント機能の設定が完了していません");
    localStorage.setItem(DEV_USER_KEY, `dev-${email.toLowerCase()}`);
    window.dispatchEvent(new Event("mishiru:auth-changed"));
    return;
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  localStorage.removeItem(DEV_USER_KEY);
  if (client) await client.auth.signOut();
  window.dispatchEvent(new Event("mishiru:auth-changed"));
}

export function onAuthChange(callback: () => void) {
  const local = () => callback();
  window.addEventListener("mishiru:auth-changed", local);
  const subscription = client?.auth.onAuthStateChange(() => callback()).data.subscription;
  return () => { window.removeEventListener("mishiru:auth-changed", local); subscription?.unsubscribe(); };
}
