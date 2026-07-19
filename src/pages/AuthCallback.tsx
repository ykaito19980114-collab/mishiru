import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, KeyRound, LoaderCircle } from "lucide-react";
import { currentSession, onAuthChange, updatePassword } from "../lib/auth";

export default function AuthCallback() {
  const location = useLocation();
  const recovery = new URLSearchParams(location.search).get("mode") === "recovery";
  const [state, setState] = React.useState<"checking" | "ready" | "done" | "error">("checking");
  const [password, setPassword] = React.useState("");
  const [confirmation, setConfirmation] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    const settle = (hasSession: boolean) => {
      if (!active) return;
      if (hasSession) setState(recovery ? "ready" : "done");
    };
    void currentSession().then((session) => settle(!!session)).catch(() => undefined);
    const off = onAuthChange((_event, session) => settle(!!session));
    const timer = window.setTimeout(() => {
      if (active) setState((current) => current === "checking" ? "error" : current);
    }, 5000);
    return () => { active = false; off(); window.clearTimeout(timer); };
  }, [recovery]);

  const savePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (password !== confirmation) {
      setMessage("確認用パスワードが一致しません。");
      return;
    }
    setBusy(true);
    try {
      await updatePassword(password);
      setState("done");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "パスワードを更新できませんでした。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-callback-page">
      <Helmet><title>{recovery ? "パスワード再設定" : "メール確認"} ｜ MISHIRU</title></Helmet>
      <section className="auth-callback-card" aria-live="polite">
        {state === "checking" && <><LoaderCircle className="auth-callback-card__spinner" aria-hidden="true" /><p className="account-modal__eyebrow">メール確認</p><h1>登録を確認しています</h1><p>完了まで、この画面を閉じずにお待ちください。</p></>}
        {state === "ready" && <><KeyRound className="auth-callback-card__icon" aria-hidden="true" /><p className="account-modal__eyebrow">パスワード再設定</p><h1>新しいパスワードを入力</h1><p>8文字以上で、ほかのサービスとは違うパスワードを使ってください。</p><form onSubmit={savePassword}><label>新しいパスワード<input type="password" minLength={8} autoComplete="new-password" required autoFocus value={password} onChange={(event) => setPassword(event.target.value)} /></label><label>新しいパスワード（確認）<input type="password" minLength={8} autoComplete="new-password" required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{message && <p className="account-modal__error" role="alert">{message}</p>}<button className="account-modal__submit" type="submit" disabled={busy}>{busy ? "パスワードを更新中…" : "新しいパスワードを保存"}</button></form></>}
        {state === "done" && <><CheckCircle2 className="auth-callback-card__icon" aria-hidden="true" /><p className="account-modal__eyebrow">完了</p><h1>{recovery ? "パスワードを更新しました" : "アカウントを作成しました"}</h1><p>保存したものや問いは、そのまま引き継がれています。</p><Link to="/search" className="account-modal__submit">研究をさがす</Link></>}
        {state === "error" && <><p className="account-modal__eyebrow">リンクエラー</p><h1>このリンクは使えません</h1><p>有効期限が切れているか、すでに使用されています。MISHIRUへ戻り、登録・ログイン画面からメールを再送してください。</p><Link to="/search" className="account-secondary-button account-secondary-button--wide">MISHIRUへ戻る</Link></>}
      </section>
    </div>
  );
}
