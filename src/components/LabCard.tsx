// 研究室の一覧行（ADR-007 Clear Board）。
// 一覧に文章を置かない: 大学メタ → 名前 → PI → Q.1行 → チップ。行全体が詳細への1リンク。
// 評価アクション（気になる/保存）は詳細ページとであうデッキに置く（1画面の主要タップ対象を絞る）。
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { MapPin, Sparkles, Users } from "lucide-react";
import type { Lab } from "../../shared/types";
import { Chip } from "./ui";
import { fieldLabel } from "../../shared/fields";
import { displayLabName, labLocation, labQuestions } from "../lib/labText";

export function LabMiniCard({ lab, reasons, actions: _actions = true, showReasons = false }: { lab: Lab; reasons?: string[]; actions?: boolean; showReasons?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}`;
  const detailPath = `/labs/${lab.id}?returnTo=${encodeURIComponent(returnTo)}`;
  const question = labQuestions(lab, 1)[0];

  return (
    <article
      className="lab-row min-w-0"
      onClick={() => navigate(detailPath)}
      role="link"
      tabIndex={0}
      aria-label={`${displayLabName(lab)}（${lab.university.name}）の詳細を見る`}
      onKeyDown={(e) => { if (e.key === "Enter") navigate(detailPath); }}
    >
      <div className="lab-row__meta">
        <MapPin aria-hidden="true" />
        <span>{lab.university.name}・{lab.major || lab.department}・{labLocation(lab)}</span>
      </div>
      <h3>{displayLabName(lab)}</h3>
      <div className="lab-row__pi">
        <span>{lab.pi.name} {lab.pi.title}</span>
        {lab.member_count > 1 && (
          <small><Users aria-hidden="true" />教員{lab.member_count}名</small>
        )}
      </div>

      {question && (
        <p className="lab-row__q"><b aria-hidden="true">Q.</b><span>{question}</span></p>
      )}

      {showReasons && reasons && reasons.length > 0 && (
        <p className="lab-row__reason"><Sparkles aria-hidden="true" /><span>{reasons[0]}</span></p>
      )}

      <div className="lab-row__chips">
        <Chip tone="blue">{fieldLabel(lab.field_major)}</Chip>
        {lab.keywords.slice(0, 2).map((k, index) => (
          <Chip key={`${k}:${index}`}>{k.length > 12 ? k.slice(0, 12) + "…" : k}</Chip>
        ))}
        {!lab.has_url && <span className="lab-row__hint">公式サイト未登録</span>}
      </div>
    </article>
  );
}
