import React from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  authConfigured,
  authHeaders,
  currentSession,
  onAuthChange,
  requestPasswordReset,
  resendConfirmation,
  signIn,
  signOut,
  signUp,
} from "../lib/auth";
import { clearLocalUserData, getSessionId, PENDING_SESSION_KEY, resetSession, setSessionId } from "../lib/session";

type Access = {
  authenticated: boolean;
  sessionId: string;
  limit: number | null;
  used: number;
  remaining: number | null;
};
type OpenMode = "signup" | "login" | "account";
type ContextValue = {
  access: Access;
  email: string | null;
  open: (mode?: OpenMode) => void;
  refresh: () => Promise<void>;
  linkCurrentSession: (session?: Session | null) => Promise<boolean>;
};

const initial: Access = { authenticated: false, sessionId: "", limit: 5, used: 0, remaining: 5 };
const Context = React.createContext<ContextValue>({
  access: initial,
  email: null,
  open: () => undefined,
  refresh: async () => undefined,
  linkCurrentSession: async () => false,
});

export function useAccountAccess() {
  return React.useContext(Context);
}

export function AccountAccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = React.useState(initial);
  const [email, setEmail] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<OpenMode | null>(null);
  const lastLinked = React.useRef("");

  const refresh = React.useCallback(async () => {
    try {
      const p = new URLSearchParams({ sessionId: getSessionId() });
      const res = await fetch(`/api/access?${p}`, { headers: await authHeaders() });
      if (!res.ok) return;
      const next = await res.json() as Access;
      setAccess(next);
      if (next.sessionId && next.sessionId !== getSessionId()) setSessionId(next.sessionId);
    } catch {
      // 一時的な通信失敗は、次の操作または認証イベントで再同期する。
    }
  }, []);

  const linkCurrentSession = React.useCallback(async (provided?: Session | null) => {
    const session = provided === undefined ? await currentSession() : provided;
    if (!session?.access_token) {
      await refresh();
      return false;
    }
    const candidate = localStorage.getItem(PENDING_SESSION_KEY) || getSessionId();
    const linkKey = `${session.user.id}:${candidate}`;
    if (lastLinked.current === linkKey) {
      await refresh();
      return true;
    }
    const res = await fetch("/api/auth/link-session", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ sessionId: candidate }),
    });
    if (!res.ok) throw new Error("アカウントと保存内容を結び付けられませんでした。もう一度お試しください。");
    const data = await res.json() as { sessionId: string };
    setSessionId(data.sessionId);
    localStorage.removeItem(PENDING_SESSION_KEY);
    lastLinked.current = linkKey;
    setEmail(session.user.email || null);
    await refresh();
    return true;
  }, [refresh]);

  React.useEffect(() => {
    let active = true;
    void currentSession()
      .then(async (session) => {
        if (!active) return;
        setEmail(session?.user.email || null);
        if (session) await linkCurrentSession(session);
        else await refresh();
      })
      .catch(() => refresh());
    const required = () => { setDialog("signup"); void refresh(); };
    const updated = () => void refresh();
    window.addEventListener("mishiru:account-required", required);
    window.addEventListener("mishiru:access-updated", updated);
    const off = onAuthChange((_event, session) => {
      setEmail(session?.user.email || null);
      window.setTimeout(() => {
        if (session) void linkCurrentSession(session).catch(() => setDialog("login"));
        else void refresh();
      }, 0);
    });
    return () => {
      active = false;
      window.removeEventListener("mishiru:account-required", required);
      window.removeEventListener("mishiru:access-updated", updated);
      off();
    };
  }, [linkCurrentSession, refresh]);

  const open = React.useCallback((mode?: OpenMode) => {
    setDialog(mode || (access.authenticated ? "account" : "signup"));
  }, [access.authenticated]);

  return (
    <Context.Provider value={{ access, email, open, refresh, linkCurrentSession }}>
      {children}
      {dialog && (
        <AccountModal
          access={access}
          email={email}
          initialMode={dialog}
          close={() => setDialog(null)}
          refresh={refresh}
          linkCurrentSession={linkCurrentSession}
        />
      )}
    </Context.Provider>
  );
}

export function AccountButton({ compact = false }: { compact?: boolean }) {
  const { access, open } = useAccountAccess();
  if (access.authenticated) {
    return (
      <button type="button" className={`account-pill ${compact ? "account-pill--compact" : ""}`} onClick={() => open("account")} title="アカウントを管理" aria-label="アカウントを管理">
        <UserRound aria-hidden="true" />
        <span>{compact ? "登録済み" : "アカウント"}</span>
        <strong>設定</strong>
      </button>
    );
  }
  return (
    <button type="button" className={`account-pill ${compact ? "account-pill--compact" : ""}`} onClick={() => open("signup")} aria-label={`無料アカウントを作る。登録なしであと${access.remaining ?? 0}回利用できます`}>
      <LogIn aria-hidden="true" />
      <span>あと{access.remaining ?? 0}回</span>
      <strong>無料登録</strong>
    </button>
  );
}

export function AccountDataPanel() {
  const { access, email, open, refresh } = useAccountAccess();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const deleteData = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteCurrentUserData(access.authenticated);
      await refresh();
      window.location.assign("/search");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "削除できませんでした。もう一度お試しください。");
      setBusy(false);
    }
  };

  return (
    <section className="account-data-panel" aria-labelledby="account-data-title">
      <div>
        <p className="account-data-panel__eyebrow">アカウント設定</p>
        <h2 id="account-data-title">アカウントとデータ</h2>
        <p>{access.authenticated ? `${email || "登録済みアカウント"}で利用中です。` : `アカウントなしで、あと${access.remaining ?? 0}回利用できます。`}</p>
      </div>
      <div className="account-data-panel__actions">
        <button type="button" className="account-secondary-button" onClick={() => open(access.authenticated ? "account" : "signup")}>
          {access.authenticated ? <ShieldCheck aria-hidden="true" /> : <LogIn aria-hidden="true" />}
          {access.authenticated ? "アカウントを管理" : "無料アカウントを作る"}
        </button>
        {!confirming ? (
          <button type="button" className="account-text-button account-text-button--danger" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />{access.authenticated ? "退会する" : "この端末のデータを削除"}</button>
        ) : (
          <div className="account-delete-confirm" role="group" aria-label="削除の確認">
            <p>{access.authenticated ? "アカウントと保存内容をすべて削除します。元に戻せません。" : "この端末に結び付いた保存内容を削除します。元に戻せません。"}</p>
            <button type="button" className="account-danger-button" disabled={busy} onClick={deleteData}>{busy ? "削除しています…" : "削除を確定"}</button>
            <button type="button" className="account-text-button" disabled={busy} onClick={() => setConfirming(false)}>キャンセル</button>
          </div>
        )}
        {error && <p className="account-modal__error" role="alert">{error}</p>}
      </div>
    </section>
  );
}

async function deleteCurrentUserData(authenticated: boolean) {
  const res = await fetch(`/api/me?sessionId=${encodeURIComponent(getSessionId())}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error?.message || "データを削除できませんでした。");
  if (authenticated) await signOut();
  clearLocalUserData();
}

function AccountModal({
  access,
  email: currentEmail,
  initialMode,
  close,
  refresh,
  linkCurrentSession,
}: {
  access: Access;
  email: string | null;
  initialMode: OpenMode;
  close: () => void;
  refresh: () => Promise<void>;
  linkCurrentSession: (session?: Session | null) => Promise<boolean>;
}) {
  const [mode, setMode] = React.useState<OpenMode | "reset">(initialMode);
  const [email, setEmail] = React.useState(currentEmail || "");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [consent, setConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [error, setError] = React.useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = React.useState(false);

  const switchMode = (next: OpenMode | "reset") => {
    setMode(next);
    setPassword("");
    setConfirmation("");
    setConsent(false);
    setMessage("");
    setError("");
    setAwaitingConfirmation(false);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "reset") {
        await requestPasswordReset(email);
        setMessage("パスワード再設定メールを送りました。メール内のリンクから新しいパスワードを設定してください。");
        return;
      }
      localStorage.setItem(PENDING_SESSION_KEY, getSessionId());
      if (mode === "signup") {
        if (password !== confirmation) throw new Error("確認用パスワードが一致しません。");
        const result = await signUp(email, password);
        if (result.needsEmailConfirmation) {
          setAwaitingConfirmation(true);
          setMessage("確認メールを送りました。メール内のリンクを開くと、保存内容を引き継いで登録が完了します。");
          return;
        }
      } else {
        await signIn(email, password);
      }
      await linkCurrentSession();
      await refresh();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "処理に失敗しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError("");
    try {
      await resendConfirmation(email);
      setMessage("確認メールを再送しました。届かない場合は迷惑メールフォルダもご確認ください。");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "確認メールを再送できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="account-backdrop" role="presentation" onMouseDown={busy ? undefined : close}>
      <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="account-modal__close" type="button" aria-label="閉じる" onClick={close} disabled={busy}><X aria-hidden="true" /></button>

        {mode === "account" ? (
          <AccountOverview email={currentEmail} close={close} refresh={refresh} />
        ) : (
          <>
            <p className="account-modal__eyebrow">無料アカウント</p>
            <h2 id="account-title">{mode === "reset" ? "パスワードを再設定" : "無料で続きを使う"}</h2>
            <p>{mode === "reset" ? "登録したメールアドレスへ、再設定リンクを送ります。" : "いままでの保存内容を引き継ぎ、回数を気にせず使えます。"}</p>

            {mode !== "reset" && (
              <div className="account-modal__benefits" aria-label="引き継がれる内容">
                <span><CheckCircle2 aria-hidden="true" />保存したもの</span>
                <span><CheckCircle2 aria-hidden="true" />つくった問い</span>
                <span><CheckCircle2 aria-hidden="true" />研究プラン</span>
              </div>
            )}

            {mode !== "reset" && (
              <div className="account-modal__tabs" role="tablist" aria-label="登録またはログイン">
                <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>アカウント作成</button>
                <button type="button" role="tab" aria-selected={mode === "login"} className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>ログイン</button>
              </div>
            )}

            {!authConfigured && <p className="account-modal__error">現在、アカウントを作成できません。時間をおいて、もう一度お試しください。</p>}
            <form onSubmit={submit}>
              <label>メールアドレス<input type="email" autoComplete="email" required autoFocus value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              {mode !== "reset" && (
                <label>パスワード<input type="password" minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /><span className="account-field-help">8文字以上</span></label>
              )}
              {mode === "signup" && (
                <label>パスワード（確認）<input type="password" minLength={8} autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
              )}
              {mode === "signup" && (
                <label className="account-consent">
                  <input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} />
                  <span><Link to="/privacy" target="_blank" rel="noopener noreferrer">プライバシーポリシー</Link>に同意します</span>
                </label>
              )}
              {error && <p className="account-modal__error" role="alert">{error}</p>}
              {message && <p className="account-modal__message" role="status">{message}</p>}
              <button className="account-modal__submit" type="submit" disabled={busy || !authConfigured}>
                {busy ? (mode === "signup" ? "アカウントを作成中…" : mode === "login" ? "ログイン中…" : "メールを送信中…") : mode === "signup" ? "無料アカウントを作る" : mode === "login" ? "ログインする" : "再設定メールを送る"}
              </button>
            </form>

            <div className="account-modal__links">
              {mode === "login" && <button type="button" onClick={() => switchMode("reset")}><KeyRound aria-hidden="true" />パスワードを忘れた方</button>}
              {mode === "reset" && <button type="button" onClick={() => switchMode("login")}><LogIn aria-hidden="true" />ログインへ戻る</button>}
              {awaitingConfirmation && <button type="button" disabled={busy} onClick={resend}><Mail aria-hidden="true" />確認メールを再送</button>}
            </div>
            <small>見るだけなら回数は減りません。登録後も無料です。</small>
            <button type="button" className="account-modal__browse" onClick={close}>登録せずに見る</button>
          </>
        )}
      </section>
    </div>
  );
}

function AccountOverview({ email, close, refresh }: { email: string | null; close: () => void; refresh: () => Promise<void> }) {
  const [busy, setBusy] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [error, setError] = React.useState("");

  const logout = async () => {
    setBusy(true);
    await signOut();
    // アカウントの正規sessionIdを匿名状態で使い続けない。
    resetSession();
    await refresh();
    close();
  };
  const remove = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteCurrentUserData(true);
      close();
      window.location.assign("/search");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "退会処理に失敗しました。");
      setBusy(false);
    }
  };

  return (
    <>
      <p className="account-modal__eyebrow">アカウント設定</p>
      <h2 id="account-title">アカウント</h2>
      <div className="account-overview__identity"><UserRound aria-hidden="true" /><div><span>ログイン中</span><strong>{email || "登録済みアカウント"}</strong></div></div>
      <p>保存したもの、反応、問い、研究プランは、このアカウントに引き継がれています。</p>
      <button type="button" className="account-secondary-button account-secondary-button--wide" disabled={busy} onClick={logout}><LogOut aria-hidden="true" />ログアウト</button>
      <div className="account-overview__danger">
        <h3>退会とデータ削除</h3>
        <p>アカウントと保存内容をすべて削除します。この操作は元に戻せません。</p>
        {!confirming ? <button type="button" className="account-text-button account-text-button--danger" onClick={() => setConfirming(true)}><Trash2 aria-hidden="true" />退会手続きへ</button> : <div className="account-delete-confirm"><button type="button" className="account-danger-button" disabled={busy} onClick={remove}>{busy ? "削除しています…" : "退会してすべて削除"}</button><button type="button" className="account-text-button" disabled={busy} onClick={() => setConfirming(false)}>キャンセル</button></div>}
      </div>
      {error && <p className="account-modal__error" role="alert">{error}</p>}
    </>
  );
}
