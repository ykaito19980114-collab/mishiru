// SCR-LP: LPトップページ（ADR-008）。初見者にサービス価値を伝え、/searchへ送客する。
// アプリシェル（サイドバー・下部タブ・FAB）は持たない（Layout.tsxでバイパス）。
// CONCEPT: ADR-007「Clear Board, One Blue」の営業版 — 青=行動・ライム=主要CTA・実数がヒーロー。
// 統計・料金・機能説明はすべて実データ/実装に基づく（数値と機能の誇張禁止）。
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  Search, Lightbulb, MessageCircle, BookOpen, Building2, Users, Bookmark, Radar,
  Sparkles, Layers, Landmark, GraduationCap, School, FlaskConical, Briefcase,
  ArrowRight, ChevronDown, Brain, HelpCircle,
} from "lucide-react";
import { BrandMark } from "../components/BrandMark";
import "../landing.css";

// 実データ件数（2026-07-21確認: data/labs.json ほか data/normalized/*.json）
const STATS = [
  { icon: Building2, label: "研究室", value: "19,785", unit: "件" },
  { icon: Layers, label: "研究領域", value: "606", unit: "" },
  { icon: Landmark, label: "学会", value: "1,700", unit: "" },
  { icon: BookOpen, label: "ジャーナル", value: "1,648", unit: "" },
  { icon: School, label: "大学", value: "100", unit: "校" },
];

const HERO_EXAMPLES = [
  "人が本音を言いづらいのはなぜ？",
  "気候変動はいつから始まった？",
  "AIは人の仕事を奪うの？",
  "睡眠はなぜ必要？",
  "チームで意見がまとまらないのはなぜ？",
];

const PROBLEMS = [
  { icon: Brain, title: "言葉にしづらい関心がある", body: "なんとなく気になることはあるけれど、うまく言葉にできない。" },
  { icon: Search, title: "何を調べればいいか分からない", body: "検索しても専門用語ばかりで、どこから読めばいいか分からない。" },
  { icon: Users, title: "誰に相談すればいいか分からない", body: "興味はあるけれど、相談できる人や場所の見つけ方が分からない。" },
];

const FLOW = [
  { icon: Lightbulb, label: "気になること" },
  { icon: MessageCircle, label: "問いにする" },
  { icon: BookOpen, label: "研究領域を知る" },
  { icon: Building2, label: "研究室・論文を探す" },
  { icon: Users, label: "相談の準備へ" },
];

const STEPS = [
  { icon: Lightbulb, title: "気になることを入力する", body: "思いついたことを、そのままの言葉で入力。" },
  { icon: MessageCircle, title: "問いにする", body: "AIがあなたの言葉を、研究の問いの形に整理。" },
  { icon: Search, title: "研究を探す", body: "研究室・領域・学会・ジャーナルを横断検索。" },
  { icon: Bookmark, title: "保存する", body: "気になった情報を、ワンクリックで保存。" },
  { icon: Users, title: "相談の準備をする", body: "相談したい内容を一枚に整理して、準備完了。" },
];

const FEATURES = [
  { icon: Search, title: "研究をさがす", body: "気になることから、研究室・領域・学会・ジャーナルを横断して検索。", to: "/search" },
  { icon: Sparkles, title: "問いを見る", body: "研究室の問いをカードでめくり、新しい関心の入口に出会う。", to: "/discover" },
  { icon: Bookmark, title: "保存したもの", body: "気になる研究室や文章を保存して、あとからまとめて見返す。", to: "/saved" },
  { icon: Radar, title: "関心を整理", body: "ためた反応から、いまの関心を分析して次の探索先を整理。", to: "/reflect" },
  { icon: Layers, title: "問いをつくる", body: "気になることを、研究できる問いと研究プランへ育てる。", to: "/questions" },
];

const AUDIENCES = [
  { icon: School, title: "高校生", body: "進路や興味のヒントを見つけたい。" },
  { icon: GraduationCap, title: "学部生", body: "卒論テーマや研究室を探したい。" },
  { icon: FlaskConical, title: "大学院生", body: "研究の視野を広げ、共同研究先を見つけたい。" },
  { icon: Briefcase, title: "社会人・学び直し", body: "学び直しや専門性を深めたい。" },
  { icon: Building2, title: "企業・共同研究探索", body: "共同研究先や技術シーズを見つけたい。" },
];

const FAQS = [
  { q: "料金はかかりますか？", a: "現在、料金はかかりません。登録なしでも試せます（AIを使う操作は5回まで）。無料アカウントを作ると、内容を引き継いだまま回数制限なく使えます。" },
  { q: "登録しないと使えませんか？", a: "登録なしで今すぐ使えます。検索・閲覧は自由で、AIを使う操作だけゲストは5回までです。" },
  { q: "掲載されている情報は正確ですか？", a: "公開情報をもとに整理しており、研究室が未確認の項目は「未確認」と明示しています。AIによる推定にはその旨のラベルを付け、修正のご依頼も受け付けています。" },
  { q: "誰のためのサービスですか？", a: "研究テーマや研究室を探したい高校生・学部生・大学院生をはじめ、学び直したい社会人や、共同研究先を探す企業の方にも使えます。" },
];

export default function Landing() {
  const navigate = useNavigate();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const goSearch = (query?: string) => {
    const value = (query ?? inputRef.current?.value ?? "").trim();
    navigate(value.length >= 2 ? `/search?ai=${encodeURIComponent(value)}` : "/search");
  };

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MISHIRU",
    alternateName: "みしる",
    url: "https://mishiru-lab.com/",
    description: "気になることから、研究を探す。全国19,785件の研究室と、研究領域・学会・ジャーナルを横断して探索できる研究テーマ発見ナビ。",
  };

  return (
    <div className="lp">
      <Helmet>
        <title>MISHIRU（みしる）｜気になることから、研究を探す</title>
        <meta name="description" content="モヤモヤした関心や疑問を、研究の問い・研究領域・研究室・論文につなげる研究テーマ発見ナビ。全国19,785件の研究室を掲載。登録なしで今すぐ使えます。" />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* ===== LP内ナビ（md以上のみ。ロゴとページ間導線はアプリシェル側が持つ） ===== */}
      <header className="lp-header">
        <div className="lp-header__inner">
          <nav className="lp-header__nav" aria-label="ページ内ナビゲーション">
            <a href="#features">機能</a>
            <a href="#how">使い方</a>
            <a href="#audience">対象ユーザー</a>
            <a href="#faq">料金・FAQ</a>
          </nav>
          <div className="lp-header__actions">
            <Link to="/search" className="lp-login">ログイン</Link>
            <Link to="/search" className="lp-cta lp-cta--sm">無料で始める</Link>
          </div>
        </div>
      </header>

      <div className="lp-main">
        {/* ===== 1. Hero ===== */}
        <section className="lp-hero" aria-labelledby="lp-hero-title">
          <div className="lp-hero__copy">
            <h1 id="lp-hero-title">気になることから、<br />研究を探す。</h1>
            <p className="lp-hero__lead">モヤモヤした関心や疑問を、研究の「問い」や「研究室」「学会・ジャーナル」、そして相談の準備につなげます。</p>
            <form className="lp-hero__search" onSubmit={(e) => { e.preventDefault(); goSearch(); }}>
              <div className="lp-hero__box">
                <Search aria-hidden="true" />
                <input ref={inputRef} type="text" placeholder="例）人が本音を言うのはなぜ？" aria-label="気になっていること" autoComplete="off" />
              </div>
              <button type="submit" className="lp-cta">研究をさがす</button>
            </form>
            <p className="lp-hero__eg-label">たとえば、こんな気になること</p>
            <div className="lp-hero__examples">
              {HERO_EXAMPLES.map((eg) => (
                <button key={eg} type="button" onClick={() => goSearch(eg)}>{eg}</button>
              ))}
            </div>
          </div>
          <div className="lp-hero__visual" aria-hidden="true">
            <img src="/assets/motifs/mishiru-sculpture-640.png" alt="" width={613} height={640} loading="eager" decoding="async" />
            <span className="lp-hero__count">全国の研究室<strong>19,785<small>件</small></strong></span>
          </div>
        </section>

        {/* ===== 2. 課題提示 ===== */}
        <section className="lp-section" aria-labelledby="lp-problem-title">
          <h2 id="lp-problem-title" className="lp-h2">多くの人は、はじめから“研究のキーワード”を持っていません。</h2>
          <div className="lp-cards lp-cards--3">
            {PROBLEMS.map(({ icon: Icon, title, body }) => (
              <article key={title} className="lp-card">
                <span className="lp-card__icon"><Icon aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ===== 3. 価値提案（淡青バンド） ===== */}
        <section className="lp-band lp-band--soft" aria-labelledby="lp-value-title">
          <h2 id="lp-value-title" className="lp-h2 lp-h2--accent">MISHIRUは、あなたの「気になること」を研究の入口に変えます。</h2>
          <div className="lp-flow" role="list">
            {FLOW.map(({ icon: Icon, label }, i) => (
              <React.Fragment key={label}>
                {i > 0 && <ArrowRight className="lp-flow__arrow" aria-hidden="true" />}
                <div className="lp-flow__step" role="listitem">
                  <span><Icon aria-hidden="true" /></span>
                  {label}
                </div>
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* ===== 4. 使い方 ===== */}
        <section id="how" className="lp-section" aria-labelledby="lp-how-title">
          <h2 id="lp-how-title" className="lp-h2">使い方は、かんたん<em>5</em>ステップ</h2>
          <ol className="lp-steps">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <li key={title}>
                <span className="lp-steps__num" aria-hidden="true">{i + 1}</span>
                <span className="lp-steps__icon"><Icon aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ===== 5. 主な機能 ===== */}
        <section id="features" className="lp-section" aria-labelledby="lp-features-title">
          <h2 id="lp-features-title" className="lp-h2">MISHIRUの主な機能</h2>
          <div className="lp-cards lp-cards--5">
            {FEATURES.map(({ icon: Icon, title, body, to }) => (
              <Link key={title} to={to} className="lp-card lp-card--link">
                <span className="lp-card__icon"><Icon aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </Link>
            ))}
          </div>
        </section>

        {/* ===== 6. インターフェース紹介（CSSモックアップ） ===== */}
        <section className="lp-section" aria-labelledby="lp-ui-title">
          <h2 id="lp-ui-title" className="lp-h2">かんたん・見やすいインターフェース</h2>
          <div className="lp-cards lp-cards--3">
            <article className="lp-card lp-shot">
              <h3><span className="lp-tag">検索体験</span>自然な言葉で検索できる検索バーと候補チップ。</h3>
              <div className="lp-shot__frame" aria-hidden="true">
                <div className="lp-shot__hero">
                  <i className="lp-shot__line lp-shot__line--title" />
                  <div className="lp-shot__searchbar"><i /><b /></div>
                  <div className="lp-shot__chips"><i /><i /><i /></div>
                </div>
              </div>
            </article>
            <article className="lp-card lp-shot">
              <h3><span className="lp-tag">検索結果</span>研究室・論文・領域をカードで見やすく表示。</h3>
              <div className="lp-shot__frame" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="lp-shot__row">
                    <i className="lp-shot__line lp-shot__line--sm" />
                    <i className="lp-shot__line" />
                    <div className="lp-shot__chips"><i /><i /></div>
                  </div>
                ))}
              </div>
            </article>
            <article className="lp-card lp-shot">
              <h3><span className="lp-tag">保存・整理</span>保存した情報を整理し、自分の関心を可視化。</h3>
              <div className="lp-shot__frame" aria-hidden="true">
                <div className="lp-shot__stats"><b /><b /><b /><b /></div>
                <div className="lp-shot__row"><i className="lp-shot__line" /><i className="lp-shot__line lp-shot__line--sm" /></div>
              </div>
            </article>
          </div>
        </section>

        {/* ===== 7. 対象ユーザー ===== */}
        <section id="audience" className="lp-section" aria-labelledby="lp-audience-title">
          <h2 id="lp-audience-title" className="lp-h2">こんな方におすすめです</h2>
          <div className="lp-cards lp-cards--5">
            {AUDIENCES.map(({ icon: Icon, title, body }) => (
              <article key={title} className="lp-card lp-card--center">
                <span className="lp-card__icon"><Icon aria-hidden="true" /></span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ===== 8. 実績（実数） ===== */}
        <section className="lp-section" aria-labelledby="lp-stats-title">
          <h2 id="lp-stats-title" className="lp-h2">全国の研究とつながる、信頼のプラットフォーム</h2>
          <div className="lp-stats">
            {STATS.map(({ icon: Icon, label, value, unit }) => (
              <div key={label} className="lp-stat">
                <span className="lp-stat__label"><Icon aria-hidden="true" />{label}</span>
                <strong>{value}<small>{unit}</small></strong>
              </div>
            ))}
          </div>
          <p className="lp-note">※掲載数は2026年7月時点のものです。</p>
        </section>

        {/* ===== 9. FAQ（料金含む） ===== */}
        <section id="faq" className="lp-section lp-section--narrow" aria-labelledby="lp-faq-title">
          <h2 id="lp-faq-title" className="lp-h2">料金・よくある質問</h2>
          <div className="lp-faq">
            {FAQS.map(({ q, a }, i) => (
              <details key={q} open={i === 0}>
                <summary><HelpCircle aria-hidden="true" /><span>{q}</span><ChevronDown className="lp-faq__chev" aria-hidden="true" /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ===== 10. CTAバンド ===== */}
        <section className="lp-band lp-band--blue" aria-labelledby="lp-cta-title">
          <h2 id="lp-cta-title">まずは、気になることから。</h2>
          <p>あなたの「知りたい」を、研究の世界へつなげます。</p>
          <div className="lp-band__actions">
            <Link to="/search" className="lp-cta lp-cta--lg">無料で始める<ArrowRight aria-hidden="true" /></Link>
            <Link to="/search" className="lp-band__login">ログインはこちら</Link>
          </div>
        </section>
      </div>

      {/* ===== LPフッター ===== */}
      <footer className="lp-footer">
        <div className="lp-footer__inner">
          <div className="lp-footer__brand">
            <BrandMark />
            <p>気になることが、未来の研究をつくる。</p>
          </div>
          <nav className="lp-footer__nav" aria-label="フッターナビゲーション">
            <a href="#features">機能</a>
            <a href="#how">使い方</a>
            <a href="#audience">対象ユーザー</a>
            <a href="#faq">料金・FAQ</a>
            <Link to="/for-labs">研究室関係者の方へ</Link>
            <Link to="/policy">掲載ポリシー</Link>
            <Link to="/claim">修正・掲載のご依頼</Link>
          </nav>
        </div>
        <p className="lp-footer__copy">© 2026 MISHIRU ｜ 研究前夜を、相談できる一枚へ。</p>
      </footer>
    </div>
  );
}
