// アプリシェル：モバイル下部4タブ（IA-02）＋ md以上でヘッダーナビ。
import React from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Sparkles, Archive, Radar, Lightbulb, BookOpen, Send, Menu, X, ChevronDown } from "lucide-react";
import { BrandMark } from "./BrandMark";
import { FloatingMemoButton } from "./FloatingMemoButton";
import { AiModelSelector } from "./AiModelSelector";
import { AccountButton } from "./AccountAccess";

const TABS = [
  { to: "/search", label: "研究をさがす", icon: Search },
  { to: "/discover", label: "問いを見る", icon: Sparkles },
  { to: "/saved", label: "保存したもの", icon: Archive },
  { to: "/reflect", label: "関心を整理", icon: Radar },
  { to: "/questions", label: "問いをつくる", icon: Lightbulb },
  { to: "/projects", label: "研究プラン", icon: BookOpen },
  { to: "/consult", label: "相談先を探す", icon: Send },
];
const MOBILE_TABS = TABS.slice(0, 4);

function isActive(pathname: string, to: string) {
  if (to === "/search") return pathname.startsWith("/search") || pathname.startsWith("/labs") || pathname.startsWith("/universities") || pathname.startsWith("/departments");
  if (to === "/discover") return pathname.startsWith("/discover") || pathname.startsWith("/cards");
  if (to === "/reflect") return pathname.startsWith("/reflect") || pathname.startsWith("/profile");
  return pathname.startsWith(to);
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isAdmin = pathname.startsWith("/admin");
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const menuTriggerRef = React.useRef<HTMLButtonElement>(null);
  const menuWasOpen = React.useRef(false);

  React.useEffect(() => {
    setMobileMenuOpen(false);
    window.requestAnimationFrame(() => document.querySelector<HTMLElement>("#main-content")?.focus({ preventScroll: true }));
  }, [pathname]);

  React.useEffect(() => {
    document.body.classList.toggle("menu-open", mobileMenuOpen);
    if (mobileMenuOpen) {
      window.requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-label="メニューを閉じる"]')?.focus());
    } else if (menuWasOpen.current) {
      window.requestAnimationFrame(() => menuTriggerRef.current?.focus());
    }
    menuWasOpen.current = mobileMenuOpen;
    return () => document.body.classList.remove("menu-open");
  }, [mobileMenuOpen]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const modal = document.querySelector<HTMLElement>('.modal-backdrop, [aria-modal="true"]'); if (!modal) return;
      if (event.key === "Escape") { event.preventDefault(); modal.querySelector<HTMLElement>('[aria-label="閉じる"],[aria-label="メニューを閉じる"]')?.click(); return; }
      if (event.key !== "Tab") return;
      const focusable = Array.from(modal.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter((item) => item.offsetParent !== null);
      if (!focusable.length) return; const first=focusable[0],last=focusable[focusable.length-1];
      if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown",onKeyDown); return()=>document.removeEventListener("keydown",onKeyDown);
  },[]);

  if (isAdmin) return <>{children}</>; // 管理画面は別シェル
  // LPトップ（SCR-LP・ADR-008改）: アプリシェル（サイドバー/ハンバーガー/下部タブ）の中に描画し、
  // 既存ページへの導線を保つ。フッターとFABはLP側が持つ/不要のため出さない
  const isLanding = pathname === "/";

  return (
    <div className="mishiru-shell min-h-screen bg-[var(--c-bg)] text-[var(--c-ink)]">
      <a href="#main-content" className="skip-link">本文へスキップ</a>

      <aside className="mishiru-sidebar">
        <div className="mishiru-sidebar__inner">
          <Link to="/search" className="brand-link" aria-label="MISHIRU ホーム">
            <BrandMark />
          </Link>
          <p className="mishiru-sidebar__copy">
            はじめよう、研究前夜。
          </p>
          <nav className="mishiru-sidebar__nav" aria-label="メインナビゲーション">
            {TABS.slice(0, 4).map((t, index) => {
              const Icon = t.icon;
              const active = isActive(pathname, t.to);
              return (
                  <Link key={t.to}
                    to={t.to}
                    aria-current={active ? "page" : undefined}
                    className={`nav-pill ${active ? "nav-pill--active" : ""}`}
                  >
                    <span className="nav-pill__index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <Icon className="w-4 h-4" aria-hidden="true" />
                    <span>{t.label}</span>
                    {active && <span className="nav-pill__marker" aria-hidden="true" />}
                  </Link>
              );
            })}
            <details className="sidebar-tools" open={TABS.slice(4).some((tab) => isActive(pathname, tab.to)) || undefined}>
              <summary><span>問いと相談</span><ChevronDown aria-hidden="true"/></summary>
              <div>
                {TABS.slice(4).map((t) => { const Icon = t.icon; const active = isActive(pathname, t.to); return <Link key={t.to} to={t.to} aria-current={active ? "page" : undefined} className={`nav-pill ${active ? "nav-pill--active" : ""}`}><Icon className="w-4 h-4" aria-hidden="true"/><span>{t.label}</span>{active && <span className="nav-pill__marker" aria-hidden="true" />}</Link>; })}
              </div>
            </details>
          </nav>
          <div className="mishiru-sidebar__footer">
            <AccountButton />
            <details className="sidebar-ai-settings"><summary>使うAIを選ぶ<ChevronDown aria-hidden="true"/></summary><AiModelSelector /></details>
          </div>
        </div>
      </aside>

      <header className="mishiru-mobile-header safe-top">
        <Link to="/search" className="brand-link" aria-label="MISHIRU ホーム">
          <BrandMark />
        </Link>
        <div className="mishiru-mobile-header__actions"><AccountButton compact /><button ref={menuTriggerRef} className="mobile-menu-trigger" type="button" aria-expanded={mobileMenuOpen} aria-controls="mobile-journey-menu" onClick={() => setMobileMenuOpen((open) => !open)}>
          {mobileMenuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
          <span>{mobileMenuOpen ? "閉じる" : "メニュー"}</span>
        </button></div>
      </header>

      {mobileMenuOpen && <div className="mobile-journey-backdrop" role="presentation" onMouseDown={() => setMobileMenuOpen(false)}>
        <section id="mobile-journey-menu" className="mobile-journey-menu" role="dialog" aria-modal="true" aria-labelledby="mobile-journey-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="mobile-journey-menu__head"><div><p>できること</p><h2 id="mobile-journey-title">MISHIRUのメニュー</h2></div><button type="button" aria-label="メニューを閉じる" onClick={() => setMobileMenuOpen(false)}><X aria-hidden="true" /></button></div>
          <nav aria-label="すべての機能" className="mobile-journey-menu__nav">
            {TABS.map((tab, index) => { const Icon = tab.icon; const active = isActive(pathname, tab.to); return <Link key={tab.to} to={tab.to} aria-current={active ? "page" : undefined}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span><Icon aria-hidden="true"/><strong>{tab.label}</strong></Link>; })}
          </nav>
          <AiModelSelector compact />
          <AccountButton />
          <p className="mobile-journey-menu__note">AIを使うときは、ここで選んだモデルを使います。APIキーは端末へ送られません。</p>
        </section>
      </div>}

      {/* 本文 */}
      <main id="main-content" tabIndex={-1} className="mishiru-main pb-[calc(var(--tab-h)+env(safe-area-inset-bottom)+28px)] md:pb-0">
        {children}
      </main>

      {/* フッター（md以上のみ。LPは自前のlp-footerを持つため出さない） */}
      {!isLanding && <footer className="hidden md:block site-footer mishiru-footer">
        <div className="max-w-6xl mx-auto px-6 py-7 flex items-center justify-between text-xs text-[var(--c-ink-3)]">
          <span>© 2026 MISHIRU</span>
          <span className="flex gap-4">
            <Link to="/policy" className="hover:text-[var(--c-ink)]">掲載ポリシー</Link>
            <Link to="/privacy" className="hover:text-[var(--c-ink)]">プライバシーポリシー</Link>
            <Link to="/claim" className="hover:text-[var(--c-ink)]">修正・掲載のご依頼</Link>
          </span>
        </div>
      </footer>}

      {/* 下部タブ（モバイル） */}
      <nav
        aria-label="メインナビゲーション"
        className="mobile-nav md:hidden fixed bottom-0 inset-x-0 z-50 safe-bottom"
      >
        <div className="flex h-[var(--tab-h)]">
          {MOBILE_TABS.map((t) => {
            const Icon = t.icon;
            const active = isActive(pathname, t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? "page" : undefined}
                className={`mobile-nav__item ${active ? "mobile-nav__item--active" : ""}`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 2} />
                <span className="text-[11px] font-bold">{t.label}</span>
                {active && <span className="mobile-nav__marker" aria-hidden="true" />}
              </Link>
            );
          })}
        </div>
      </nav>
      {/* 下部固定アクションバーを持つ画面（研究室詳細・であう）とLPはFABを出さない（重なり防止。メモはためる/詳細ページ内で可能） */}
      {!isLanding && !pathname.startsWith("/questions") && !pathname.startsWith("/projects") && !pathname.startsWith("/discover") && !/^\/labs\/[^/]+/.test(pathname) && <FloatingMemoButton />}
    </div>
  );
}
