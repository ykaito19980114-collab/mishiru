import {
  createClient,
  type AuthChangeEvent,
  type Session,
} from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const client = url && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;
const DEV_USER_KEY = "mishiru_dev_user";

export const authConfigured = !!client || import.meta.env.DEV;

function callbackUrl(mode?: "recovery") {
  if (typeof window === "undefined") return undefined;
  const url = new URL("/auth/callback", window.location.origin);
  if (mode) url.searchParams.set("mode", mode);
  return url.toString();
}

export function authErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/invalid login credentials/i.test(message)) return "メールアドレスまたはパスワードが正しくありません。";
  if (/email not confirmed/i.test(message)) return "メール確認がまだ完了していません。確認メール内のリンクを開いてください。";
  if (/user already registered|already been registered/i.test(message)) return "このメールアドレスは登録済みです。ログインをお試しください。";
  if (/password should be at least|weak password/i.test(message)) return "パスワードは8文字以上で設定してください。";
  if (/rate limit|too many requests|security purposes/i.test(message)) return "操作が続いたため一時的に制限されています。少し待ってからお試しください。";
  if (/expired|invalid.*token|otp/i.test(message)) return "リンクの有効期限が切れているか、すでに使用されています。もう一度メールを送信してください。";
  if (/network|fetch/i.test(message)) return "通信できませんでした。接続を確認して、もう一度お試しください。";
  return message || "認証処理に失敗しました。もう一度お試しください。";
}

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
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(authErrorMessage(error));
  return data.session;
}

export async function signUp(email: string, password: string) {
  if (!client) {
    if (!import.meta.env.DEV) throw new Error("アカウント機能の設定が完了していません。");
    localStorage.setItem(DEV_USER_KEY, `dev-${email.toLowerCase()}`);
    window.dispatchEvent(new Event("mishiru:auth-changed"));
    return { needsEmailConfirmation: false };
  }
  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) throw new Error(authErrorMessage(error));
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  if (!client) {
    if (!import.meta.env.DEV) throw new Error("アカウント機能の設定が完了していません。");
    localStorage.setItem(DEV_USER_KEY, `dev-${email.toLowerCase()}`);
    window.dispatchEvent(new Event("mishiru:auth-changed"));
    return;
  }
  const { error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error) throw new Error(authErrorMessage(error));
}

export async function resendConfirmation(email: string) {
  if (!client) throw new Error("開発環境では確認メールは送信されません。");
  const { error } = await client.auth.resend({
    type: "signup",
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: callbackUrl() },
  });
  if (error) throw new Error(authErrorMessage(error));
}

export async function requestPasswordReset(email: string) {
  if (!client) throw new Error("開発環境では再設定メールは送信されません。");
  const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: callbackUrl("recovery"),
  });
  if (error) throw new Error(authErrorMessage(error));
}

export async function updatePassword(password: string) {
  if (!client) throw new Error("アカウント機能の設定が完了していません。");
  const { error } = await client.auth.updateUser({ password });
  if (error) throw new Error(authErrorMessage(error));
}

export async function signOut() {
  localStorage.removeItem(DEV_USER_KEY);
  if (client) await client.auth.signOut().catch(() => undefined);
  window.dispatchEvent(new Event("mishiru:auth-changed"));
}

export function onAuthChange(callback: (event: AuthChangeEvent | "LOCAL", session: Session | null) => void) {
  const local = () => { void currentSession().then((session) => callback("LOCAL", session)).catch(() => callback("LOCAL", null)); };
  window.addEventListener("mishiru:auth-changed", local);
  const subscription = client?.auth.onAuthStateChange((event, session) => callback(event, session)).data.subscription;
  return () => {
    window.removeEventListener("mishiru:auth-changed", local);
    subscription?.unsubscribe();
  };
}
