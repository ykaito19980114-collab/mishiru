import { Helmet } from "react-helmet-async";
import { Home, Search } from "lucide-react";
import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-center">
      <Helmet>
        <title>ページが見つかりません ｜ MISHIRU</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <p className="eyebrow">404</p>
      <h1 className="text-2xl font-black mt-2">ページが見つかりません</h1>
      <p className="text-[var(--c-ink-2)] mt-3">URLが変わったか、ページが削除された可能性があります。</p>
      <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
        <Link to="/search" className="app-button inline-flex items-center justify-center gap-2 min-h-[48px] px-5 bg-[var(--c-primary)] text-white font-bold">
          <Search aria-hidden="true" className="w-4 h-4" />研究をさがす
        </Link>
        <Link to="/" className="app-button inline-flex items-center justify-center gap-2 min-h-[48px] px-5 bg-white text-[var(--c-primary)] border border-[var(--c-primary)] font-bold">
          <Home aria-hidden="true" className="w-4 h-4" />トップへ戻る
        </Link>
      </div>
    </div>
  );
}
