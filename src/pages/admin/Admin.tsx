// SCR-07 運営管理（KPI・リード・Claim・診断・記事・カード）。§7 認可＝x-admin-token。
import React, { useState, useEffect, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { BarChart3, Users, ShieldAlert, FileText, Newspaper, LayoutGrid, LogOut, Database } from "lucide-react";
import { adminApi, setAdminToken, getAdminToken } from "./adminApi";
import { Button, Card } from "../../components/ui";
import { KpiPanel } from "./KpiPanel";
import { LabsPanel } from "./LabsPanel";
import { LeadsPanel } from "./LeadsPanel";
import { ClaimsPanel } from "./ClaimsPanel";
import { ReportsPanel } from "./ReportsPanel";
import { ArticlesPanel } from "./ArticlesPanel";
import { CardsPanel } from "./CardsPanel";

const TABS = [
  { id: "kpi", label: "KPI", icon: BarChart3 },
  { id: "labs", label: "研究室データ", icon: Database },
  { id: "leads", label: "リード", icon: Users },
  { id: "claims", label: "Claim対応", icon: ShieldAlert },
  { id: "reports", label: "見え方診断", icon: FileText },
  { id: "articles", label: "記事", icon: Newspaper },
  { id: "cards", label: "カード成績", icon: LayoutGrid },
];

export default function Admin() {
  const [tab, setTab] = useState("kpi");
  const [authed, setAuthed] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [token, setToken] = useState(getAdminToken());
  const [err, setErr] = useState("");

  useEffect(() => { adminApi.health().then(setHealth).catch(() => {}); }, []);

  const tryAuth = useCallback(async () => {
    setErr("");
    setAdminToken(token);
    try {
      await adminApi.kpi(); // 認可チェックを兼ねる
      setAuthed(true);
    } catch (e) {
      setErr((e as Error).message || "認証に失敗しました");
    }
  }, [token]);

  // ADMIN_TOKEN未設定（開発モード）なら即入場
  useEffect(() => {
    if (health && !health.adminProtected) setAuthed(true);
  }, [health]);

  if (!authed) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--c-surface)] px-4">
        <Helmet>
          <title>運営管理ログイン ｜ MISHIRU</title>
          <meta name="robots" content="noindex,nofollow" />
        </Helmet>
        <Card className="p-6 w-full max-w-sm">
          <h1 className="text-lg font-bold mb-1">運営管理ログイン</h1>
          <p className="text-sm text-[var(--c-ink-2)] mb-4">管理トークンを入力してください。</p>
          <input type="password" value={token} onChange={(e) => setToken(e.target.value)} onKeyDown={(e) => e.key === "Enter" && tryAuth()}
            className="w-full px-3 py-2.5 min-h-[44px] rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-teal)] mb-3" placeholder="ADMIN_TOKEN" />
          {err && <p className="text-sm text-[var(--c-danger)] mb-3">{err}</p>}
          <Button onClick={tryAuth} className="w-full">ログイン</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--c-surface)]">
      <Helmet>
        <title>運営管理 ｜ MISHIRU</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <header className="bg-white border-b border-[var(--c-border)] sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold">MISHIRU 運営管理</span>
            {health && !health.adminProtected && <span className="text-[11px] bg-[var(--c-accent-yellow)] text-[var(--c-accent-yellow-ink)] px-2 py-0.5 rounded-full">開発モード（ADMIN_TOKEN未設定）</span>}
          </div>
          <a href="/discover" className="text-sm text-[var(--c-ink-2)] flex items-center gap-1"><LogOut className="w-4 h-4" />サイトへ</a>
        </div>
        <div className="max-w-6xl mx-auto px-2 flex gap-1 overflow-x-auto scrollbar-thin">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`shrink-0 flex items-center gap-1.5 px-4 py-3 text-sm font-bold border-b-2 min-h-[44px] ${tab === t.id ? "border-[var(--c-primary)] text-[var(--c-primary)]" : "border-transparent text-[var(--c-ink-3)]"}`}>
                <Icon className="w-4 h-4" />{t.label}
              </button>
            );
          })}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "kpi" && <KpiPanel />}
        {tab === "labs" && <LabsPanel />}
        {tab === "leads" && <LeadsPanel />}
        {tab === "claims" && <ClaimsPanel />}
        {tab === "reports" && <ReportsPanel />}
        {tab === "articles" && <ArticlesPanel />}
        {tab === "cards" && <CardsPanel />}
      </main>
    </div>
  );
}
