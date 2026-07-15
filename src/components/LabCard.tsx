// 研究室カード（一覧・候補・接続理由表示）。タグ検索・リアクション導線つき。
import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MapPin, Sparkles, ChevronRight, Users, Heart, Bookmark } from "lucide-react";
import type { Lab } from "../../shared/types";
import { Chip } from "./ui";
import { fieldLabel } from "../../shared/fields";
import { displayLabName, labLocation, labQuestions } from "../lib/labText";
import { api } from "../lib/api";

export function LabMiniCard({ lab, reasons, actions = true, showReasons = false }: { lab: Lab; reasons?: string[]; actions?: boolean; showReasons?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const returnTo = `${location.pathname}${location.search}`;
  const detailPath = `/labs/${lab.id}?returnTo=${encodeURIComponent(returnTo)}`;

  const goDetail = () => navigate(detailPath);
  const goTag = (tag: string) => navigate(`/labs?tag=${encodeURIComponent(tag)}`);
  const goField = () => navigate(`/labs?field=${encodeURIComponent(lab.field_major)}`);
  const act = async (action: "like" | "save") => {
    setBusy(action);
    await api.actOnLab(lab.id, action);
    setDone(action);
    setBusy(null);
  };

  return (
    <article className="lab-card h-full p-5 flex flex-col group min-w-0" onClick={goDetail} role="link" tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter") goDetail(); }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-[var(--c-ink-3)] mb-1">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{lab.university.name}・{lab.major || lab.department}・{labLocation(lab)}</span>
          </div>
          <h3 className="font-bold text-[var(--c-ink)] leading-snug line-clamp-2">{displayLabName(lab)}</h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <p className="text-sm text-[var(--c-ink-2)]">{lab.pi.name} {lab.pi.title}</p>
            {lab.member_count > 1 && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-[var(--c-ink-3)]"><Users className="w-3 h-3" />教員{lab.member_count}名</span>
            )}
          </div>
        </div>
        <span className="lab-card__arrow"><ChevronRight className="w-4 h-4" /></span>
      </div>

      <div className="mt-3 lab-question-block">
        <div className="text-[12px] font-black text-[var(--c-primary)] mb-1">この研究室が扱う問い</div>
        <ul className="space-y-1">
          {labQuestions(lab, 2).map((q, index) => (
            <li key={`${q}:${index}`} className="flex gap-1.5 text-[14px] leading-snug text-[var(--c-ink)]">
              <span className="text-[var(--c-blue)] font-black shrink-0">Q.</span>
              <span>{q}</span>
            </li>
          ))}
        </ul>
      </div>

      {showReasons && reasons && reasons.length > 0 && (
        <div className="mt-3 bg-[var(--c-surface-blue)] rounded-[10px] p-2.5">
          <div className="flex items-center gap-1 text-[11px] font-bold text-[var(--c-primary)] mb-1">
            <Sparkles className="w-3 h-3" /> あなたとの接続
          </div>
          <p className="text-[13px] text-[var(--c-ink-2)] leading-snug">{reasons[0]}</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-3">
        <button type="button" onClick={(e) => { e.stopPropagation(); goField(); }} className="contents" aria-label={`${fieldLabel(lab.field_major)}の研究室を見る`}>
          <Chip tone="blue">{fieldLabel(lab.field_major)}</Chip>
        </button>
        {lab.keywords.slice(0, 2).map((k, index) => (
          <button key={`${k}:${index}`} type="button" onClick={(e) => { e.stopPropagation(); goTag(k); }} className="contents" aria-label={`${k}の研究室を見る`}>
            <Chip>{k.length > 12 ? k.slice(0, 12) + "…" : k}</Chip>
          </button>
        ))}
        {!lab.has_url && <span className="text-[10px] text-[var(--c-ink-3)] ml-auto">公式サイト未登録</span>}
      </div>

      {actions && (
        <div className="grid grid-cols-2 gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
          <button type="button" onClick={() => act("like")} disabled={busy !== null}
            className={`min-h-[40px] rounded-[10px] border text-[13px] font-bold flex items-center justify-center gap-1.5 ${done === "like" ? "bg-[var(--c-surface-blue)] text-[var(--c-primary)] border-[var(--c-primary)]" : "bg-white border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>
            <Heart className="w-4 h-4" />気になる
          </button>
          <button type="button" onClick={() => act("save")} disabled={busy !== null}
            className={`min-h-[40px] rounded-[10px] border text-[13px] font-bold flex items-center justify-center gap-1.5 ${done === "save" ? "bg-[var(--c-accent-yellow)] text-[var(--c-ink)] border-[var(--c-primary)]" : "bg-white border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>
            <Bookmark className="w-4 h-4" />保存する
          </button>
        </div>
      )}
    </article>
  );
}
