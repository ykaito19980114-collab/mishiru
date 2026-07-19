// 共通UIプリミティブ（docs/03 §8 SPEC トークン準拠・ADR-007 Clear Board）
import React from "react";
import { ChevronDown, Info } from "lucide-react";
import { cleanDisplayLabel } from "../../shared/text";

export function Button({
  children, variant = "primary", className = "", ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const base =
    "app-button inline-flex items-center justify-center gap-2 font-bold min-h-[48px] px-5 disabled:opacity-40 disabled:cursor-not-allowed";
  const variants: Record<string, string> = {
    primary: "bg-[var(--c-primary)] text-white hover:bg-[var(--c-primary-strong)]",
    secondary: "bg-white text-[var(--c-primary)] border border-[var(--c-primary)] hover:bg-[var(--c-primary)] hover:text-white",
    ghost: "bg-transparent text-[var(--c-ink-2)] hover:bg-[var(--c-surface)]",
    danger: "bg-white text-[var(--c-danger)] border border-[var(--c-danger)] hover:bg-[#fdeceb]",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}

// チップは灰（属性）・青（分野）・淡ライム（保存済み等の状態）の3トーン（ADR-007改）。tealは青に丸める。
export function Chip({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "blue" | "yellow" | "teal" }) {
  const tones: Record<string, string> = {
    default: "bg-[var(--c-surface)] text-[var(--c-ink-2)] border-transparent",
    blue: "bg-[var(--c-surface-blue)] text-[var(--c-primary)] border-transparent",
    yellow: "bg-[var(--c-signal-soft)] text-[var(--c-ink)] border-transparent",
    teal: "bg-[var(--c-surface-blue)] text-[var(--c-primary)] border-transparent",
  };
  const content = typeof children === "string" ? cleanDisplayLabel(children) : children;
  return (
    <span className={`inline-flex items-center text-[12.5px] font-medium px-2.5 py-1 rounded-full border ${tones[tone]}`}>
      {content}
    </span>
  );
}

// 信頼・免責の注記。本文と同格にせず12.5px灰1行で示す（テキストは必ずspanで包む＝flex崩れ防止）
export function TrustNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`trust-note ${className}`}>
      <Info aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Card({ children, className = "", float = false }: { children: React.ReactNode; className?: string; float?: boolean }) {
  return (
    <div
      className={`bg-white border border-[var(--c-border)] rounded-[var(--radius-card)] ${float ? "shadow-[var(--shadow-float)]" : "shadow-[var(--shadow-sm)]"} ${className}`}
    >
      {children}
    </div>
  );
}

export function Disclosure({
  summary,
  description,
  children,
  className = "",
  defaultOpen = false,
}: {
  summary: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  return (
    <details className={`reading-disclosure ${className}`} open={defaultOpen || undefined}>
      <summary>
        <span><strong>{summary}</strong>{description && <small>{description}</small>}</span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div className="reading-disclosure__body">{children}</div>
    </details>
  );
}

// 空状態：必ず「次の行動」を持つ（docs/03 §3 共通規則）
export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      {icon && <div className="text-[var(--c-ink-3)] mb-4">{icon}</div>}
      <h3 className="text-lg font-bold text-[var(--c-ink)]">{title}</h3>
      {description && <p className="text-[var(--c-ink-2)] mt-2 max-w-sm">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton rounded-[var(--radius-panel)] ${className}`} />;
}

// エラー状態（再試行つき）
export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  return (
    <EmptyState
      title="内容を読み込めませんでした"
      description={message || "通信状況を確認して、もう一度読み込んでください。"}
      action={onRetry && <Button variant="secondary" onClick={onRetry}>もう一度読み込む</Button>}
    />
  );
}

// verified/confidence バッジ（NFR-DQ-01）
export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Chip tone="teal">研究室確認済み</Chip>
  ) : (
    <Chip tone="default">研究室未確認</Chip>
  );
}

// トースト
export function Toast({ message, show }: { message: string; show: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed left-1/2 -translate-x-1/2 bottom-[calc(var(--tab-h)+16px)] z-[60] transition-all duration-200 ${show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"}`}
    >
      <div className="bg-[var(--c-ink)] text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-[var(--shadow-float)]">
        {message}
      </div>
    </div>
  );
}

export function useToast() {
  const [toast, setToast] = React.useState<{ msg: string; show: boolean }>({ msg: "", show: false });
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showToast = React.useCallback((msg: string) => {
    setToast({ msg, show: true });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((t) => ({ ...t, show: false })), 1600);
  }, []);
  return { toast, showToast };
}
