import React from "react";

export class AppErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ui] unexpected error", error.message, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-fatal" role="alert" aria-labelledby="app-fatal-title">
        <p className="eyebrow">MISHIRU</p>
        <h1 id="app-fatal-title">画面を表示できませんでした</h1>
        <p>入力内容は消さずに残しています。画面を再読み込みしてください。</p>
        <div>
          <button type="button" onClick={() => window.location.reload()}>画面を再読み込み</button>
          <a href="/search">研究をさがすへ</a>
        </div>
      </main>
    );
  }
}
