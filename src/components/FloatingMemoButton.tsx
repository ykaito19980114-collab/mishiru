import React from "react";
import { X, Plus, Highlighter } from "lucide-react";
import { useLocation } from "react-router-dom";
import { Button, Toast, useToast } from "./ui";
import { labelText, makeAnnotation, MarkLabel, saveAnnotation } from "../lib/annotations";

type MemoKind =
  | "memo"
  | "quote"
  | "book"
  | "article"
  | "paper"
  | "social_post"
  | "lab_event"
  | "external_url";

const KIND_OPTIONS: { id: MemoKind; label: string }[] = [
  { id: "memo", label: "メモ" },
  { id: "quote", label: "引用" },
  { id: "book", label: "本" },
  { id: "article", label: "記事・ニュース" },
  { id: "paper", label: "論文" },
  { id: "social_post", label: "投稿" },
  { id: "lab_event", label: "研究室・イベント" },
  { id: "external_url", label: "その他URL" },
];

function sourceTypeFor(kind: MemoKind) {
  if (kind === "paper") return "paper";
  if (kind === "external_url" || kind === "article" || kind === "social_post" || kind === "lab_event") return "external_url";
  return "research_theme_card";
}

export function FloatingMemoButton() {
  const [open, setOpen] = React.useState(false);
  const [selectedText, setSelectedText] = React.useState("");
  const [note, setNote] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [label, setLabel] = React.useState<MarkLabel>("good");
  const [kind, setKind] = React.useState<MemoKind>("memo");
  const location = useLocation();
  const { toast, showToast } = useToast();

  const captureSelection = React.useCallback(() => {
    const text = window.getSelection()?.toString().trim() || "";
    if (text) {
      setSelectedText(text);
      showToast("選択文を入れました");
    } else {
      showToast("選択中の文章がありません");
    }
  }, [showToast]);

  const openPanel = () => {
    setOpen(true);
    const text = window.getSelection()?.toString().trim() || "";
    if (text) setSelectedText(text);
  };

  const reset = () => {
    setSelectedText("");
    setNote("");
    setUrl("");
    setLabel("good");
    setKind("memo");
  };

  const save = () => {
    const content = selectedText.trim() || note.trim();
    if (!content) {
      showToast("内容を入力してください");
      return;
    }
    const path = `${location.pathname}${location.search}`;
    saveAnnotation(makeAnnotation({
      sourceType: sourceTypeFor(kind),
      sourceTitle: KIND_OPTIONS.find((item) => item.id === kind)?.label || "メモ",
      sourceUrl: url.trim() || path,
      selectedText: content,
      label,
      note: selectedText.trim() ? note : "",
    }));
    reset();
    setOpen(false);
    showToast("ためるに保存しました");
  };

  return (
    <>
      <button type="button" className="floating-memo-button" onClick={openPanel}>
        <Plus className="w-5 h-5" />
        <span>メモ追加</span>
      </button>

      {open && (
        <div className="memo-panel" role="dialog" aria-modal="true" aria-labelledby="memo-panel-title">
          <div className="memo-panel__header">
            <div>
              <p className="mishiru-eyebrow">SAVE TO TAME-RU</p>
              <h2 id="memo-panel-title">メモ追加</h2>
            </div>
            <button type="button" className="memo-panel__close" onClick={() => setOpen(false)} aria-label="閉じる">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="memo-panel__section">
            <label className="memo-panel__label">反応</label>
            <div className="memo-panel__chips">
              {(["good", "unclear", "not_fit", "important"] as MarkLabel[]).map((id) => (
                <button key={id} type="button" onClick={() => setLabel(id)} className={label === id ? "is-active" : ""}>
                  {labelText(id)}
                </button>
              ))}
            </div>
          </div>

          <div className="memo-panel__section">
            <label className="memo-panel__label" htmlFor="memo-kind">種別</label>
            <select id="memo-kind" value={kind} onChange={(event) => setKind(event.target.value as MemoKind)} className="memo-panel__input">
              {KIND_OPTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </div>

          <div className="memo-panel__section">
            <label className="memo-panel__label" htmlFor="memo-content">選択した文章、または気になった内容</label>
            <textarea id="memo-content" value={selectedText} onChange={(event) => setSelectedText(event.target.value)} rows={4} className="memo-panel__input" />
            <button type="button" className="memo-panel__selection" onClick={captureSelection}>
              <Highlighter className="w-4 h-4" />選択文を入れる
            </button>
          </div>

          <div className="memo-panel__section">
            <label className="memo-panel__label" htmlFor="memo-note">理由メモ（任意）</label>
            <input id="memo-note" value={note} onChange={(event) => setNote(event.target.value)} className="memo-panel__input" />
          </div>

          <div className="memo-panel__section">
            <label className="memo-panel__label" htmlFor="memo-url">参照リンク（任意）</label>
            <input id="memo-url" value={url} onChange={(event) => setUrl(event.target.value)} className="memo-panel__input" placeholder="空欄なら現在のページを保存" />
          </div>

          <div className="memo-panel__actions">
            <Button variant="secondary" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button onClick={save}>ためる</Button>
          </div>
        </div>
      )}
      <Toast message={toast.msg} show={toast.show} />
    </>
  );
}
