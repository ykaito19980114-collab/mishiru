import React from "react";
import { LogIn, UserRound, X } from "lucide-react";
import { authConfigured, authHeaders, onAuthChange, signIn, signOut, signUp } from "../lib/auth";
import { getSessionId, setSessionId } from "../lib/session";

type Access = { authenticated: boolean; sessionId: string; limit: number | null; used: number; remaining: number | null };
const initial: Access = { authenticated: false, sessionId: "", limit: 5, used: 0, remaining: 5 };
const Context = React.createContext<{ access: Access; open: () => void; refresh: () => Promise<void> }>({ access: initial, open: () => {}, refresh: async () => {} });

export function AccountAccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = React.useState(initial); const [isOpen, setOpen] = React.useState(false);
  const refresh = React.useCallback(async () => { try { const p = new URLSearchParams({ sessionId: getSessionId() }); const res = await fetch(`/api/access?${p}`, { headers: await authHeaders() }); if (res.ok) setAccess(await res.json()); } catch { /* 次回同期 */ } }, []);
  React.useEffect(() => { void refresh(); const required=()=>{setOpen(true);void refresh();}; const updated=()=>void refresh(); window.addEventListener("mishiru:account-required",required); window.addEventListener("mishiru:access-updated",updated); const off=onAuthChange(updated); return()=>{window.removeEventListener("mishiru:account-required",required);window.removeEventListener("mishiru:access-updated",updated);off();}; },[refresh]);
  return <Context.Provider value={{access,open:()=>setOpen(true),refresh}}>{children}{isOpen&&<AccountModal access={access} close={()=>setOpen(false)} refresh={refresh}/>}</Context.Provider>;
}

export function AccountButton({ compact=false }: { compact?: boolean }) {
  const {access,open,refresh}=React.useContext(Context);
  if(access.authenticated)return <button type="button" className={`account-pill ${compact?"account-pill--compact":""}`} onClick={async()=>{await signOut();await refresh();}} title="ログアウト"><UserRound/><span>{compact?"登録済み":"アカウント登録済み"}</span></button>;
  return <button type="button" className={`account-pill ${compact?"account-pill--compact":""}`} onClick={open}><LogIn/><span>{access.remaining??0}回無料</span><strong>登録</strong></button>;
}

function AccountModal({access,close,refresh}:{access:Access;close:()=>void;refresh:()=>Promise<void>}){
  const[mode,setMode]=React.useState<"signup"|"login">("signup");const[email,setEmail]=React.useState("");const[password,setPassword]=React.useState("");const[busy,setBusy]=React.useState(false);const[message,setMessage]=React.useState("");const[error,setError]=React.useState("");
  const submit=async(event:React.FormEvent)=>{event.preventDefault();setBusy(true);setError("");setMessage("");try{if(mode==="signup"){const result=await signUp(email,password);if(result.needsEmailConfirmation){setMessage("確認メールを送りました。メール内のリンクを開いたあと、ログインしてください。");return;}}else await signIn(email,password);const res=await fetch("/api/auth/link-session",{method:"POST",headers:{"Content-Type":"application/json",...(await authHeaders())},body:JSON.stringify({sessionId:getSessionId()})});if(!res.ok)throw new Error("アカウントと現在のデータを結び付けられませんでした");const data=await res.json();setSessionId(data.sessionId);await refresh();close();}catch(e){setError(e instanceof Error?e.message:"処理に失敗しました");}finally{setBusy(false);}};
  return <div className="account-backdrop" role="presentation" onMouseDown={close}><section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onMouseDown={e=>e.stopPropagation()}><button className="account-modal__close" type="button" aria-label="閉じる" onClick={close}><X/></button><p className="account-modal__eyebrow">KEEP EXPLORING</p><h2 id="account-title">見つけた関心を、この先も育てる。</h2><p>無料体験の{access.limit??5}回を使い切ったあとは、無料アカウントで続けられます。今までの保存や問いも、そのまま引き継ぎます。</p><div className="account-modal__tabs" role="tablist"><button type="button" className={mode==="signup"?"active":""} onClick={()=>setMode("signup")}>はじめて登録</button><button type="button" className={mode==="login"?"active":""} onClick={()=>setMode("login")}>ログイン</button></div>{!authConfigured&&<p className="account-modal__error">現在、アカウント機能の公開設定を準備中です。</p>}<form onSubmit={submit}><label>メールアドレス<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label><label>パスワード<input type="password" minLength={8} autoComplete={mode==="signup"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></label>{error&&<p className="account-modal__error" role="alert">{error}</p>}{message&&<p className="account-modal__message" role="status">{message}</p>}<button className="account-modal__submit" type="submit" disabled={busy||!authConfigured}>{busy?"処理しています…":mode==="signup"?"無料アカウントを作る":"ログインして続ける"}</button></form><small>閲覧だけでは回数を消費しません。検索・保存・AI生成など、結果が生まれる操作だけを数えます。</small></section></div>;
}
