// 研究室の絞り込みパネル（SCR-04b）。必要なときだけ開く共通ダイアログ。
import React, { useEffect, useState } from "react";
import { X, ChevronDown } from "lucide-react";
import { api } from "../lib/api";
import { FIELD_MAJORS, fieldLabel } from "../../shared/fields";
import { REGIONS, UNIV_TYPE_LABEL } from "../../shared/universities";
import { Button } from "./ui";

export interface Filters {
  q: string; univ: string; field: string; region: string; prefecture: string;
  type: string; pi_title: string; size: string; major: string;
}
export const EMPTY_FILTERS: Filters = { q: "", univ: "", field: "", region: "", prefecture: "", type: "", pi_title: "", size: "", major: "" };

const PI_TITLES = ["教授", "准教授", "講師", "助教", "特任教授"];
const SIZES = [{ v: "1", l: "教員1名" }, { v: "2-3", l: "教員2〜3名" }, { v: "4+", l: "教員4名以上" }];
const TYPES = [{ v: "national", l: "国立" }, { v: "public", l: "公立" }, { v: "private", l: "私立" }];
const splitValues = (value: string) => value.split(",").map((v) => v.trim()).filter(Boolean);
const hasValue = (value: string, item: string) => splitValues(value).includes(item);
const toggleCsv = (value: string, item: string) => {
  const current = splitValues(value);
  const next = current.includes(item) ? current.filter((v) => v !== item) : [...current, item];
  return next.join(",");
};

export function FilterSheet({ open, onClose, filters, onChange, onApply }: {
  open: boolean; onClose: () => void; filters: Filters;
  onChange: (f: Filters) => void; onApply: () => void;
}) {
  const [facets, setFacets] = useState<{ field: Record<string, number>; region: Record<string, number>; type: Record<string, number> } | null>(null);
  const [universities, setUniversities] = useState<string[]>([]);
  const [prefectures, setPrefectures] = useState<string[]>([]);

  useEffect(() => {
    api.getFilters().then((d) => { setFacets(d.facets); setUniversities(d.universities); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (filters.region) api.getPrefectures(filters.region).then((d) => setPrefectures(d.prefectures)).catch(() => setPrefectures([]));
    else setPrefectures([]);
  }, [filters.region]);

  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  const body = (
    <div className="space-y-6">
      {/* 大学（検索付きdatalist） */}
      <Group label="大学">
        <input list="univ-list" value={filters.univ} onChange={(e) => set({ univ: e.target.value })}
          placeholder="大学名を入力・選択" className={inp} />
        <datalist id="univ-list">{universities.map((u) => <option key={u} value={u} />)}</datalist>
      </Group>

      {/* 分野（12＋件数バッジ） */}
      <Group label="分野" hint="複数選択できます">
        <div className="flex flex-wrap gap-2">
          {FIELD_MAJORS.map((f) => {
            const n = facets?.field[f.id];
            if (f.id === "other" && !n) return null;
            const active = hasValue(filters.field, f.id);
            return (
              <button key={f.id} onClick={() => set({ field: toggleCsv(filters.field, f.id) })}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border min-h-[40px] ${active ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-[var(--c-surface)] border-transparent text-[var(--c-ink-2)]"}`}>
                {f.label}{n ? <span className={`ml-1 ${active ? "text-white/70" : "text-[var(--c-ink-3)]"}`}>{n}</span> : ""}
              </button>
            );
          })}
        </div>
      </Group>

      {/* 地域→都道府県 */}
      <Group label="地域" hint="複数選択できます">
        <div className="flex flex-wrap gap-2">
          {REGIONS.map((r) => {
            const active = hasValue(filters.region, r);
            return (
              <button key={r} onClick={() => set({ region: toggleCsv(filters.region, r), prefecture: "" })}
                className={`text-xs font-bold px-3 py-1.5 rounded-full border min-h-[40px] ${active ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-[var(--c-surface)] border-transparent text-[var(--c-ink-2)]"}`}>
                {r}{facets?.region[r] ? <span className={`ml-1 ${active ? "text-white/70" : "text-[var(--c-ink-3)]"}`}>{facets.region[r]}</span> : ""}
              </button>
            );
          })}
        </div>
        {filters.region && prefectures.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-bold text-[var(--c-ink-3)] mb-1">都道府県（複数選択可）</div>
            <div className="flex flex-wrap gap-2">
              {prefectures.map((p) => {
                const active = hasValue(filters.prefecture, p);
                return (
                  <button key={p} onClick={() => set({ prefecture: toggleCsv(filters.prefecture, p) })}
                    className={`text-xs font-bold px-2.5 py-1.5 rounded-full border min-h-[40px] ${active ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-[var(--c-surface)] border-transparent text-[var(--c-ink-2)]"}`}>
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Group>

      {/* 設置区分 */}
      <Group label="設置区分" hint="複数選択できます">
        <div className="flex gap-2">
          {TYPES.map((t) => {
            const active = hasValue(filters.type, t.v);
            return (
              <button key={t.v} onClick={() => set({ type: toggleCsv(filters.type, t.v) })}
                className={`flex-1 text-xs font-bold px-3 py-2 rounded-[var(--radius-btn)] border min-h-[44px] ${active ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white border-[var(--c-border-strong)] text-[var(--c-ink-2)]"}`}>
                {t.l}{facets?.type[t.v] ? <span className={`ml-1 text-xs ${active ? "text-white/70" : "text-[var(--c-ink-3)]"}`}>{facets.type[t.v]}</span> : ""}
              </button>
            );
          })}
        </div>
      </Group>

      {/* 専攻 */}
      <Group label="専攻・研究科">
        <input value={filters.major} onChange={(e) => set({ major: e.target.value })} placeholder="例：情報 / 機械 / 建築" className={inp} />
      </Group>

      {/* 職位 */}
      <Group label="主宰者の職位">
        <Select value={filters.pi_title} onChange={(v) => set({ pi_title: v })} placeholder="すべて" options={PI_TITLES.map((p) => ({ v: p, l: p }))} />
      </Group>

      {/* 規模 */}
      <Group label="研究室規模" hint="登録されている所属教員数で判定します。教授・准教授・講師・助教・特任教授などを含み、学生数は含みません。">
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button key={s.v} onClick={() => set({ size: toggleCsv(filters.size, s.v) })}
              className={`text-xs font-bold px-3 py-1.5 rounded-full border min-h-[40px] ${hasValue(filters.size, s.v) ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-[var(--c-surface)] border-transparent text-[var(--c-ink-2)]"}`}>
              {s.l}
            </button>
          ))}
        </div>
      </Group>
    </div>
  );

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end md:justify-center md:items-center" role="dialog" aria-modal="true" aria-label="絞り込み">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="relative w-full bg-white rounded-t-[var(--radius-card)] md:rounded-[var(--radius-card)] md:max-w-[620px] max-h-[85vh] flex flex-col shadow-[var(--shadow-float)]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-border)]">
              <h2 className="text-base font-black">絞り込み</h2>
              <button onClick={onClose} aria-label="閉じる" className="w-11 h-11 grid place-items-center"><X className="w-5 h-5" /></button>
            </div>
            <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-4">{body}</div>
            <div className="p-4 border-t border-[var(--c-border)] safe-bottom flex gap-2">
              <Button variant="ghost" onClick={() => onChange(EMPTY_FILTERS)} className="flex-1">クリア</Button>
              <Button onClick={() => { onApply(); onClose(); }} className="flex-[2]">結果を見る</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-[var(--c-ink)] mb-1">{label}</h3>
      {hint && <p className="text-xs leading-relaxed text-[var(--c-ink-3)] mb-2">{hint}</p>}
      {children}
    </div>
  );
}
function Select({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: { v: string; l: string }[] }) {
  return (
    <div className="relative mt-2">
      <select value={value} onChange={(e) => onChange(e.target.value)} className={`${inp} appearance-none pr-8`}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
      <ChevronDown className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--c-ink-3)] pointer-events-none" />
    </div>
  );
}
const inp = "w-full px-3 py-2.5 min-h-[48px] rounded-[var(--radius-btn)] border border-[var(--c-border-strong)] outline-none focus:border-[var(--c-primary)] focus:ring-3 focus:ring-[var(--c-primary-soft)] text-[15px] bg-white";
