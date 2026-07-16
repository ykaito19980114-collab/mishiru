// ためる：気になるカードとメモをまとめて管理する場所。
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { FolderPlus, Sparkles, Pencil, Trash2, Highlighter, Filter, Check, X, Layers, Landmark, BookOpen, FileText, MessageSquare, Building2, HelpCircle } from "lucide-react";
import { api } from "../lib/api";
import type { ThemeCard, Lab, ResearchField, ResearchJournal, ResearchSociety } from "../../shared/types";
import { Button, Card, Chip, Skeleton, EmptyState, ErrorState, Toast, useToast } from "../components/ui";
import { LabMiniCard } from "../components/LabCard";
import { Annotation, labelText, makeAnnotation, MarkLabel, readAnnotations, saveAnnotation } from "../lib/annotations";
import { displayLabName, labQuestions } from "../lib/labText";

const FOLDER_KEY = "openlab_stock_folders";
const NOTE_KEY = "openlab_stock_item_notes";

type Folder = { id: string; name: string; labIds: string[] };
type View = "all" | "questions" | "labs" | "fields" | "societies" | "journals" | "papers" | "memos" | "folder";
type StockFilter = "all" | "like" | "save";
type StockResource = { action: string; kind: string; item: ResearchField | ResearchSociety | ResearchJournal; createdAt: string };

function readFolders(): Folder[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FOLDER_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeFolders(folders: Folder[]) {
  localStorage.setItem(FOLDER_KEY, JSON.stringify(folders));
}

function readNotes(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTE_KEY) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeNotes(notes: Record<string, string>) {
  localStorage.setItem(NOTE_KEY, JSON.stringify(notes));
}

export default function Saved() {
  const [state, setState] = useState<"loading" | "error" | "ok">("loading");
  const [saved, setSaved] = useState<ThemeCard[]>([]);
  const [deep, setDeep] = useState<ThemeCard[]>([]);
  const [likedLabs, setLikedLabs] = useState<Lab[]>([]);
  const [savedLabs, setSavedLabs] = useState<Lab[]>([]);
  const [discoveryItems, setDiscoveryItems] = useState<StockResource[]>([]);
  const [folders, setFolders] = useState<Folder[]>(() => readFolders());
  const [folderName, setFolderName] = useState("");
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [view, setView] = useState<View>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>(() => readAnnotations());
  const [labelFilter, setLabelFilter] = useState<MarkLabel | "all">("all");
  const [notes, setNotes] = useState<Record<string, string>>(() => readNotes());
  const { toast, showToast } = useToast();

  const persistFolders = (next: Folder[]) => {
    setFolders(next);
    writeFolders(next);
  };

  const refreshAnnotations = () => setAnnotations(readAnnotations());

  const load = async () => {
    setState("loading");
    try {
      const res = await api.getSaved();
      setSaved(res.saved);
      setDeep(res.deepDived);
      setLikedLabs(res.likedLabs || []);
      setSavedLabs(res.savedLabs || []);
      setDiscoveryItems(res.discoveryItems || []);
      refreshAnnotations();
      setState("ok");
    } catch { setState("error"); }
  };
  useEffect(() => { load(); }, []);

  const labsById = useMemo(() => {
    const map = new Map<string, Lab>();
    [...likedLabs, ...savedLabs].forEach((lab) => map.set(lab.id, lab));
    return map;
  }, [likedLabs, savedLabs]);

  const combinedLabs = useMemo(() => Array.from(labsById.values()), [labsById]);
  const filteredDiscovery = discoveryItems.filter((x) => stockFilter === "all" || x.action === stockFilter);
  const fields = filteredDiscovery.filter((x) => x.kind === "field") as (StockResource & { item: ResearchField })[];
  const societies = filteredDiscovery.filter((x) => x.kind === "society") as (StockResource & { item: ResearchSociety })[];
  const journals = filteredDiscovery.filter((x) => x.kind === "journal") as (StockResource & { item: ResearchJournal })[];
  const visibleLabs = stockFilter === "like" ? likedLabs : stockFilter === "save" ? savedLabs : combinedLabs;
  const questionItems = Array.from(new Map([
    ...visibleLabs.flatMap((lab) => labQuestions(lab, 2).map((text) => ({ text, source: displayLabName(lab), kind: "研究室" }))),
    ...fields.flatMap(({ item }) => (item.questions || []).map((text) => ({ text, source: item.nameJa, kind: "研究領域" }))),
    ...societies.flatMap(({ item }) => (item.questions || []).map((text) => ({ text, source: item.name, kind: "学会" }))),
    ...journals.flatMap(({ item }) => (item.questions || []).map((text) => ({ text, source: item.name, kind: "ジャーナル" }))),
  ].filter((item) => item.text).map((item) => [item.text, item])).values()).slice(0, 40);
  const activeFolderLabIds = folders.find((f) => f.id === activeFolder)?.labIds || [];
  const folderLabs = activeFolderLabIds.map((id) => labsById.get(id)).filter((l): l is Lab => !!l);
  const filteredMarks = annotations.filter((a) => labelFilter === "all" || a.label === labelFilter);
  const allCount = visibleLabs.length + fields.length + societies.length + journals.length + saved.length + deep.length + annotations.length;
  const isEmpty = allCount === 0;

  const createFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    const next = [...folders, { id: `folder-${Date.now().toString(36)}`, name: name.slice(0, 24), labIds: [] }];
    persistFolders(next);
    setFolderName("");
    setActiveFolder(next[next.length - 1].id);
    setView("folder");
  };

  const assignFolder = (labId: string, folderId: string) => {
    const next = folders.map((folder) => ({
      ...folder,
      labIds: folder.id === folderId
        ? Array.from(new Set([...folder.labIds, labId]))
        : folder.labIds.filter((id) => id !== labId),
    }));
    persistFolders(next);
  };
  const removeFromFolder = (labId: string, folderId: string) => persistFolders(folders.map((f) => f.id === folderId ? { ...f, labIds: f.labIds.filter((id) => id !== labId) } : f));
  const startRename = (folder: Folder) => {
    setEditingFolder(folder.id);
    setEditingName(folder.name);
  };
  const commitRename = () => {
    if (!editingFolder) return;
    const name = editingName.trim();
    if (!name) return;
    persistFolders(folders.map((f) => f.id === editingFolder ? { ...f, name: name.slice(0, 24) } : f));
    setEditingFolder(null);
    setEditingName("");
  };
  const deleteFolder = (folderId: string) => {
    if (!confirm("このフォルダを削除します。中の研究室は一覧からは消えません。")) return;
    persistFolders(folders.filter((f) => f.id !== folderId));
    setActiveFolder("all");
    setView("all");
  };

  const persistNote = (key: string, value: string) => {
    const next = { ...notes, [key]: value };
    if (!value.trim()) delete next[key];
    setNotes(next);
    writeNotes(next);
  };

  const addExternalMark = (annotation: Annotation) => {
    saveAnnotation(annotation);
    refreshAnnotations();
    setView("memos");
    showToast("メモに保存しました");
  };

  return (
    <div className="max-w-3xl mx-auto px-4 pt-4 pb-8">
      <Helmet><title>ためる ｜ MISHIRU</title></Helmet>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-black mb-1">ためる</h1>
          <p className="text-sm text-[var(--c-ink-2)] line-clamp-1">気になった研究室・問い・メモを、ひとつの一覧で見返せます。</p>
        </div>
        <Link to="/reflect" className="shrink-0">
          <Button variant="secondary"><Sparkles className="w-4 h-4" />みつめる</Button>
        </Link>
      </div>

      {state === "loading" && <div className="space-y-3 mt-4"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>}
      {state === "error" && <ErrorState onRetry={load} />}
      {state === "ok" && isEmpty && (
        <EmptyState
          icon={<Sparkles className="w-10 h-10" />}
          title="まだためた材料がありません"
          description="であう画面やさがす画面で「気になる」を押すか、気になった文章をメモすると、ここでまとめて見返せます。"
          action={<Link to="/discover"><Button>研究室カードにであう</Button></Link>}
        />
      )}
      {state === "ok" && !isEmpty && (
        <div className="space-y-6 mt-5">
          <section>
            <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">保管リスト</h2>
            <div className="mb-2 inline-flex rounded-full bg-white border border-[var(--c-border)] p-1">
              {([
                ["all", "すべて"],
                ["like", "気になる"],
                ["save", "保存する"],
              ] as [StockFilter, string][]).map(([id, label]) => (
                <button key={id} onClick={() => setStockFilter(id)}
                  className={`min-h-[30px] px-3 rounded-full text-[12px] font-black ${stockFilter === id ? "bg-[var(--c-primary)] text-white" : "text-[var(--c-ink-2)]"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              <ViewButton active={view === "all"} onClick={() => setView("all")} icon={<Sparkles className="w-3.5 h-3.5" />}>すべて {allCount}</ViewButton>
              <ViewButton active={view === "memos"} onClick={() => setView("memos")} icon={<MessageSquare className="w-3.5 h-3.5" />}>メモ {annotations.length}</ViewButton>
              <ViewButton active={view === "questions"} onClick={() => setView("questions")} icon={<HelpCircle className="w-3.5 h-3.5" />}>問い {questionItems.length}</ViewButton>
              <ViewButton active={view === "labs"} onClick={() => setView("labs")} icon={<Building2 className="w-3.5 h-3.5" />}>研究室 {visibleLabs.length}</ViewButton>
              <ViewButton active={view === "fields"} onClick={() => setView("fields")} icon={<Layers className="w-3.5 h-3.5" />}>研究領域 {fields.length}</ViewButton>
              <ViewButton active={view === "societies"} onClick={() => setView("societies")} icon={<Landmark className="w-3.5 h-3.5" />}>学会 {societies.length}</ViewButton>
              <ViewButton active={view === "journals"} onClick={() => setView("journals")} icon={<BookOpen className="w-3.5 h-3.5" />}>ジャーナル {journals.length}</ViewButton>
              <ViewButton active={view === "papers"} onClick={() => setView("papers")} icon={<FileText className="w-3.5 h-3.5" />}>論文 {saved.length + deep.length}</ViewButton>
            </div>
          </section>

          <section>
            <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">フォルダ</h2>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {folders.length === 0 && <p className="text-xs text-[var(--c-ink-3)]">研究室カード下のフォルダ選択から、作成したフォルダへ移動できます。</p>}
              {folders.map((folder) => (
                <div key={folder.id} className={`shrink-0 inline-flex items-center rounded-full border overflow-hidden ${view === "folder" && activeFolder === folder.id ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>
                  {editingFolder === folder.id ? (
                    <div className="flex items-center gap-1 px-2">
                      <input value={editingName} onChange={(e) => setEditingName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commitRename(); if (e.key === "Escape") setEditingFolder(null); }}
                        className="w-28 min-h-[34px] rounded-[8px] border border-[var(--c-border)] px-2 text-[13px] text-[var(--c-ink)]" autoFocus />
                      <button onClick={commitRename} className="min-h-[36px] px-1" aria-label="フォルダ名を保存"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingFolder(null)} className="min-h-[36px] px-1" aria-label="変更をキャンセル"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => { setActiveFolder(folder.id); setView("folder"); }} className="min-h-[40px] px-3 text-[13px] font-bold">{folder.name} {folder.labIds.length}</button>
                      <button onClick={() => startRename(folder)} className="min-h-[40px] px-2" aria-label={`${folder.name}の名前を変更`}><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => deleteFolder(folder.id)} className="min-h-[40px] px-2" aria-label={`${folder.name}を削除`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          <Card className="p-3 bg-white border-[var(--c-border)]">
            <h2 className="text-xs font-black text-[var(--c-primary)] mb-2">フォルダを作る</h2>
            <div className="flex gap-2">
              <input
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                placeholder="例：第一候補、先生に聞く"
                className="flex-1 min-h-[40px] px-3 rounded-[10px] border border-[var(--c-border)] outline-none focus:border-[var(--c-primary)] text-sm"
              />
              <Button onClick={createFolder} disabled={!folderName.trim()}><FolderPlus className="w-4 h-4" />追加</Button>
            </div>
          </Card>

          {view === "all" && (
            <div className="space-y-6">
              <QuestionSection items={questionItems} />
              <MarkingList items={filteredMarks} labelFilter={labelFilter} onFilter={setLabelFilter} />
              <LabSection title={`研究室（${visibleLabs.length}）`} labs={visibleLabs} folders={folders} onAssign={assignFolder} notes={notes} onNote={persistNote} />
              <ResourceSection title={`研究領域（${fields.length}）`} items={fields} notes={notes} onNote={persistNote} />
              <ResourceSection title={`学会（${societies.length}）`} items={societies} notes={notes} onNote={persistNote} />
              <ResourceSection title={`ジャーナル（${journals.length}）`} items={journals} notes={notes} onNote={persistNote} />
            </div>
          )}
          {view === "questions" && <QuestionSection items={questionItems} />}
          {view === "labs" && <LabSection title={`研究室（${visibleLabs.length}）`} labs={visibleLabs} folders={folders} onAssign={assignFolder} notes={notes} onNote={persistNote} />}
          {view === "fields" && <ResourceSection title={`研究領域（${fields.length}）`} items={fields} notes={notes} onNote={persistNote} />}
          {view === "societies" && <ResourceSection title={`学会（${societies.length}）`} items={societies} notes={notes} onNote={persistNote} />}
          {view === "journals" && <ResourceSection title={`ジャーナル（${journals.length}）`} items={journals} notes={notes} onNote={persistNote} />}
          {view === "folder" && (
            <section>
              <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">{folders.find((f) => f.id === activeFolder)?.name || "フォルダ"}（{folderLabs.length}）</h2>
              {folderLabs.length > 0 ? <LabList labs={folderLabs} folders={folders} onAssign={assignFolder} activeFolder={activeFolder} onRemove={removeFromFolder} notes={notes} onNote={persistNote} /> : (
                <Card className="p-4"><p className="text-sm text-[var(--c-ink-2)]">このフォルダはまだ空です。研究室カードの下にあるフォルダ選択から追加できます。</p></Card>
              )}
            </section>
          )}
          {view === "memos" && <MarkingList items={filteredMarks} labelFilter={labelFilter} onFilter={setLabelFilter} />}

          {saved.length > 0 && (view === "papers" || view === "all") && (
            <section>
              <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">保存したテーマカード（{saved.length}）</h2>
              <div className="space-y-3">{saved.map((c) => <SavedRow key={c.id} card={c} />)}</div>
            </section>
          )}
          {deep.length > 0 && (view === "papers" || view === "all") && (
            <section>
              <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">詳しく見たテーマカード（{deep.length}）</h2>
              <div className="space-y-3">{deep.map((c) => <SavedRow key={c.id} card={c} />)}</div>
            </section>
          )}
          <details className="rounded-[var(--radius-card)] border border-[var(--c-border)] bg-white p-4">
            <summary className="cursor-pointer text-sm font-black text-[var(--c-primary)]">外部サイトや論文からメモを追加する</summary>
            <div className="mt-3"><MarkingComposer onSave={addExternalMark} /></div>
          </details>
        </div>
      )}
      <Toast message={toast.msg} show={toast.show} />
    </div>
  );
}

function MarkingComposer({ onSave }: { onSave: (annotation: Annotation) => void }) {
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [label, setLabel] = useState<MarkLabel>("good");
  const [note, setNote] = useState("");
  const canSave = selectedText.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave(makeAnnotation({
      sourceType: sourceUrl.trim() ? "external_url" : "research_theme_card",
      sourceTitle: sourceTitle.trim() || "ためる上のメモ",
      sourceUrl: sourceUrl.trim(),
      selectedText,
      label,
      note,
    }));
    setSourceTitle("");
    setSourceUrl("");
    setSelectedText("");
    setNote("");
    setLabel("good");
  };
  return (
    <Card className="p-4 border-[var(--c-primary)]">
      <div className="flex items-center gap-1.5 text-sm font-black text-[var(--c-primary)] mb-2">
        <Highlighter className="w-4 h-4" />気になる箇所をメモ
      </div>
      <p className="text-xs text-[var(--c-ink-3)] mb-3">外部サイトや論文、研究室ページで気になった短い文章をコピー&ペーストできます。このページ内の情報ならリンクは空欄でOKです。</p>
      <div className="grid sm:grid-cols-2 gap-2 mb-2">
        <input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} placeholder="研究室名 / 論文名 / ページタイトル"
          className="min-h-[42px] rounded-[12px] border border-[var(--c-border)] px-3 text-sm outline-none focus:border-[var(--c-primary)]" />
        <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="リンク（任意）"
          className="min-h-[42px] rounded-[12px] border border-[var(--c-border)] px-3 text-sm outline-none focus:border-[var(--c-primary)]" />
      </div>
      <textarea value={selectedText} onChange={(e) => setSelectedText(e.target.value)} rows={3}
        placeholder="どの部分が気になったか"
        className="w-full rounded-[12px] border border-[var(--c-border)] p-3 text-sm outline-none focus:border-[var(--c-primary)] mb-2" />
      <div className="flex flex-wrap gap-2 mb-2">
        {(["good", "unclear", "not_fit", "important"] as MarkLabel[]).map((id) => (
          <button key={id} onClick={() => setLabel(id)}
            className={`min-h-[34px] px-3 rounded-full border text-[13px] font-bold ${label === id ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white text-[var(--c-ink-2)] border-[var(--c-border)]"}`}>
            {labelText(id)}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="理由メモ（任意）"
        className="w-full min-h-[42px] rounded-[12px] border border-[var(--c-border)] px-3 text-sm outline-none focus:border-[var(--c-primary)] mb-3" />
      <Button onClick={save} disabled={!canSave}><Highlighter className="w-4 h-4" />メモに保存</Button>
    </Card>
  );
}

function ViewButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-full border text-[13px] font-bold ${active ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>
      {icon}{children}
    </button>
  );
}

function LabSection({ title, description, labs, folders, onAssign, notes, onNote }: { title: string; description?: string; labs: Lab[]; folders: Folder[]; onAssign: (labId: string, folderId: string) => void; notes: Record<string, string>; onNote: (key: string, value: string) => void }) {
  return (
    <section>
      <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">{title}</h2>
      {description && <p className="text-xs text-[var(--c-ink-3)] mb-3">{description}</p>}
      {labs.length > 0 ? <LabList labs={labs} folders={folders} onAssign={onAssign} notes={notes} onNote={onNote} /> : (
        <Card className="p-4"><p className="text-sm text-[var(--c-ink-2)]">まだありません。</p></Card>
      )}
    </section>
  );
}

function LabList({ labs, folders, onAssign, activeFolder, onRemove, notes, onNote }: { labs: Lab[]; folders: Folder[]; onAssign: (labId: string, folderId: string) => void; activeFolder?: string; onRemove?: (labId: string, folderId: string) => void; notes: Record<string, string>; onNote: (key: string, value: string) => void }) {
  return (
    <div className="space-y-3">
      {labs.map((lab) => (
        <div key={lab.id} className="space-y-2">
          <LabMiniCard lab={lab} />
          <ItemNote itemKey={`lab:${lab.id}`} value={notes[`lab:${lab.id}`] || ""} onChange={onNote} />
          {folders.length > 0 && (
            <div className="flex items-center justify-end gap-2 text-xs">
              <span className="text-[var(--c-ink-3)]">フォルダ</span>
              <select
                onChange={(e) => e.target.value && onAssign(lab.id, e.target.value)}
                defaultValue=""
                className="min-h-[36px] rounded-[8px] border border-[var(--c-border)] px-2 bg-white"
                aria-label={`${lab.name}をフォルダへ追加`}
              >
                <option value="">選択</option>
                {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
              </select>
              {activeFolder && activeFolder !== "all" && onRemove && (
                <button onClick={() => onRemove(lab.id, activeFolder)} className="min-h-[36px] px-2 rounded-[8px] border border-[var(--c-border)] bg-white font-bold text-[var(--c-ink-3)]">外す</button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResourceSection({ title, items, notes, onNote }: { title: string; items: StockResource[]; notes: Record<string, string>; onNote: (key: string, value: string) => void }) {
  return (
    <section>
      <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">{title}</h2>
      {items.length === 0 ? (
        <Card className="p-4"><p className="text-sm text-[var(--c-ink-2)]">まだありません。</p></Card>
      ) : (
        <div className="space-y-3">
          {items.map((entry) => <ResourceStockRow key={`${entry.kind}:${resourceId(entry.item)}`} entry={entry} notes={notes} onNote={onNote} />)}
        </div>
      )}
    </section>
  );
}

function ResourceStockRow({ entry, notes, onNote }: { entry: StockResource; notes: Record<string, string>; onNote: (key: string, value: string) => void }) {
  const id = resourceId(entry.item);
  const title = resourceTitle(entry.item);
  const key = `${entry.kind}:${id}`;
  const kindLabel = entry.kind === "field" ? "研究領域" : entry.kind === "society" ? "学会" : "ジャーナル";
  const description = "definition" in entry.item
    ? entry.item.beginnerDescription || entry.item.researchPurpose || entry.item.definition || entry.item.coordinate || "説明データを整備中です。"
    : entry.item.beginnerDescription || `${entry.item.disciplines?.slice(0, 3).join("・") || entry.item.relatedFields?.slice(0, 3).join("・") || "関連データ確認中"}に近い候補です。`;
  const url = "url" in entry.item ? entry.item.url : "";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <Chip tone="blue">{kindLabel}</Chip>
          </div>
          <h3 className="text-[15px] font-black text-[var(--c-primary)] leading-snug">{title}</h3>
          <p className="text-sm text-[var(--c-ink-2)] mt-1 line-clamp-2">{description}</p>
        </div>
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[12px] font-bold text-[var(--c-primary)] min-h-[32px] inline-flex items-center">公式</a>}
      </div>
      <ItemNote itemKey={key} value={notes[key] || ""} onChange={onNote} />
    </Card>
  );
}

function QuestionSection({ items }: { items: { text: string; source: string; kind: string }[] }) {
  return (
    <section>
      <h2 className="text-sm font-black text-[var(--c-ink-2)] mb-2">問い（{items.length}）</h2>
      {items.length === 0 ? (
        <Card className="p-4"><p className="text-sm text-[var(--c-ink-2)]">まだ問いとして見られる材料がありません。</p></Card>
      ) : (
        <div className="space-y-2">
          {items.slice(0, 12).map((item, i) => (
            <Card key={`${item.text}:${i}`} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[14px] font-black text-[var(--c-ink)] leading-snug">{item.text}</p>
                <Chip tone="blue">{item.kind}</Chip>
              </div>
              <p className="mt-1 text-[11px] text-[var(--c-ink-3)]">{item.source}</p>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

function resourceId(item: ResearchField | ResearchSociety | ResearchJournal) {
  return "id" in item ? item.id : resourceTitle(item);
}

function resourceTitle(item: ResearchField | ResearchSociety | ResearchJournal) {
  return "nameJa" in item ? item.nameJa : item.name;
}

function ItemNote({ itemKey, value, onChange }: { itemKey: string; value: string; onChange: (key: string, value: string) => void }) {
  const [open, setOpen] = useState(Boolean(value));
  return (
    <div className="saved-item-note bg-white border border-[var(--c-border)]">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-[12px] font-black text-[var(--c-primary)] inline-flex items-center gap-1 min-h-[28px]">
        <MessageSquare className="w-3.5 h-3.5" />{value ? "メモを編集" : "メモを追加"}
      </button>
      {open && (
        <textarea
          value={value}
          onChange={(e) => onChange(itemKey, e.target.value)}
          placeholder="気になる理由、あとで確認したいこと、先生に聞きたいこと"
          rows={3}
          className="mt-2 w-full rounded-[12px] border border-[var(--c-border)] p-3 text-sm outline-none focus:border-[var(--c-primary)]"
        />
      )}
    </div>
  );
}

function MarkingList({ items, labelFilter, onFilter }: { items: Annotation[]; labelFilter: MarkLabel | "all"; onFilter: (label: MarkLabel | "all") => void }) {
  return (
    <section>
      <div className="flex items-center justify-between gap-2 mb-2">
        <h2 className="text-sm font-black text-[var(--c-ink-2)]">メモ（{items.length}）</h2>
        <div className="flex items-center gap-1 text-xs text-[var(--c-ink-3)]"><Filter className="w-3.5 h-3.5" />反応で絞る</div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        <button onClick={() => onFilter("all")} className={`shrink-0 min-h-[34px] px-3 rounded-full border text-[12px] font-bold ${labelFilter === "all" ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>すべて</button>
        {(["good", "unclear", "not_fit", "important"] as MarkLabel[]).map((label) => (
          <button key={label} onClick={() => onFilter(label)} className={`shrink-0 min-h-[34px] px-3 rounded-full border text-[12px] font-bold ${labelFilter === label ? "bg-[var(--c-primary)] text-white border-transparent" : "bg-white border-[var(--c-border)] text-[var(--c-ink-2)]"}`}>{labelText(label)}</button>
        ))}
      </div>
      {items.length === 0 ? (
        <Card className="p-4"><p className="text-sm text-[var(--c-ink-2)]">この条件のメモはまだありません。</p></Card>
      ) : (
        <div className="space-y-3">
          {items.map((item) => <MarkingRow key={item.id} item={item} />)}
        </div>
      )}
    </section>
  );
}

function MarkingRow({ item }: { item: Annotation }) {
  const date = new Date(item.createdAt).toLocaleDateString("ja-JP");
  const sourceUrl = item.sourceUrl && item.sourceUrl.startsWith("/labs/")
    ? `${item.sourceUrl}${item.sourceUrl.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent("/saved")}`
    : item.sourceUrl;
  return (
    <Card className="saved-memo-row p-3">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="blue">{annotationKind(item)}</Chip>
          <Chip tone={item.label === "not_fit" ? "default" : item.label === "unclear" ? "yellow" : "blue"}>{labelText(item.label)}</Chip>
          <span className="text-[11px] text-[var(--c-ink-3)]">{date}</span>
        </div>
        {sourceUrl && (
          <LinkLike href={sourceUrl}>参照リンク</LinkLike>
        )}
      </div>
      <blockquote className="text-[15px] font-bold leading-relaxed text-[var(--c-ink)] border-l-3 border-[var(--c-primary)] pl-3 line-clamp-2">
        {item.selectedText}
      </blockquote>
      {item.note && <p className="mt-2 text-[13px] text-[var(--c-ink-2)] line-clamp-1"><span className="font-black text-[var(--c-primary)]">理由メモ: </span>{item.note}</p>}
      <div className="mt-2 min-w-0">
        <h3 className="text-[12px] font-black text-[var(--c-ink-3)] truncate">{item.sourceTitle}</h3>
        {item.sourceName && <p className="text-[11px] text-[var(--c-ink-3)] truncate">{item.sourceName}</p>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.aiKeywords.slice(0, 5).map((k) => <Chip key={k}>{k}</Chip>)}
        {item.aiMethods.slice(0, 3).map((k) => <Chip key={k} tone="blue">{k}</Chip>)}
        {item.aiConditions.slice(0, 3).map((k) => <Chip key={k} tone="teal">{k}</Chip>)}
      </div>
    </Card>
  );
}

function annotationKind(item: Annotation) {
  if (item.sourceType === "lab_page") return "研究室";
  if (item.sourceType === "paper") return "ジャーナル";
  if (item.sourceType === "research_theme_card") return "その他";
  const text = `${item.sourceTitle} ${item.sourceName || ""} ${item.sourceUrl || ""}`;
  if (/学会/.test(text)) return "学会";
  if (/ジャーナル|論文|journal|jstage|sciencedirect|springer/i.test(text)) return "ジャーナル";
  if (/研究領域|分野|領域/.test(text)) return "研究領域";
  return "その他";
}

function LinkLike({ href, children }: { href: string; children: React.ReactNode }) {
  return href.startsWith("http") ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[12px] font-black text-[var(--c-primary)] min-h-[28px] inline-flex items-center">{children}</a>
  ) : (
    <Link to={href} className="shrink-0 text-[12px] font-black text-[var(--c-primary)] min-h-[28px] inline-flex items-center">{children}</Link>
  );
}

function SavedRow({ card }: { card: ThemeCard }) {
  return (
    <Link to={`/cards/${card.id}`}>
      <Card className="p-4 hover:border-[var(--c-primary)] transition-colors">
        <div className="flex items-center gap-2 mb-1"><Chip tone="blue">{card.everyday_hook}</Chip></div>
        <h3 className="font-bold text-[var(--c-ink)] leading-snug line-clamp-2">{card.title}</h3>
        <p className="text-sm text-[var(--c-ink-2)] mt-1 line-clamp-2">{card.plain_summary}</p>
      </Card>
    </Link>
  );
}
