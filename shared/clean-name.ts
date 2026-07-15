// 教員氏名のクレンジング（外部論文DB検索に氏名だけを渡すため）。
// 実データには「藤田桂英（教員）」「早川（教授）」「各教員」「徹・教授」「[Professor]」等のゴミが混入する。
// 氏名として無効なもの（職位のみ・「各教員」等）は null を返す。

// 職位・肩書を表す語（末尾から剥がす／単独なら無効）
const POSITION_WORDS = [
  "特任教授", "特命教授", "名誉教授", "招へい教授", "招聘教授", "客員教授", "客員准教授", "特任准教授", "特命准教授",
  "専任教授", "専任准教授", "専任講師", "特任講師", "特命講師", "特任助教", "特命助教",
  "准教授", "教授", "講師", "助教", "助手", "教員", "主任", "主宰", "主宰者",
  "センター長", "所長", "部門長", "特別教授", "卓越教授", "栄誉教授", "シニア教授",
  "Professor", "Prof", "Associate", "Assistant", "Lecturer",
];
// 氏名が実質存在しない無効トークン（職位プレフィックスが単独で残るケースを含む）
const INVALID_TOKENS = new Set(["各", "各教員", "教員", "スタッフ", "職位要確認", "複数", "他", "ほか", "など", "研究室", "研究員",
  "専任", "特任", "特命", "客員", "名誉", "招へい", "招聘", "特別", "卓越", "シニア", "非常勤", "特定", "", ]);
// 分野・トピックの語（これで終わる＝人名ではなく研究室/テーマ名。外部人名検索から除外）
const TOPIC_SUFFIXES = ["工学", "化学", "物理", "物理学", "科学", "生物", "生物学", "情報", "機械", "電気", "電子", "材料", "システム", "デザイン", "医学", "薬学", "農学", "経済", "経済学", "法学", "数学", "地理", "建築", "土木", "分野", "領域", "部門", "講座", "コース"];

export function cleanPersonName(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let s = raw;
  // 氏名は先頭にあるため、最初の開き括弧以降を全て落とす（未閉じの「教員（…」にも対応）
  s = s.replace(/[（(［\[〈《｛{].*$/s, " ");
  // 残った閉じ括弧・記号を除去
  s = s.replace(/[）)］\]〉》｝}]/g, " ");
  // 研究室名・ラボ名の接尾辞を除去（「大川泰一郎研究室」→「大川泰一郎」）
  s = s.replace(/(研究室|グループ|ラボ|ゼミ|Laboratory|Lab)\s*$/i, " ");
  // 「ほか/他/など」の後置注記を除去（「堀祐輔教授ほか」→「堀祐輔教授」）
  s = s.replace(/(ほか|他|など|、|，)+\s*$/g, " ");
  // 「職位要確認」等の注記を除去
  s = s.replace(/職位要確認/g, " ");
  // 区切り（全半角スペース・中黒・スラッシュ・読点・カンマ）で分割
  const tokens = s.split(/[ 　・･／\/,、;；]+/).map((t) => t.trim()).filter(Boolean);

  // 入力は既に「／」で1教員ずつ分割済み前提。職位以外のトークンを氏名として拾う。
  const nameParts: string[] = [];
  let hasLatin = false;
  for (let tok of tokens) {
    if (POSITION_WORDS.includes(tok)) continue;      // 職位そのもの（「准教授」）は先に除外
    if (INVALID_TOKENS.has(tok)) continue;           // 無効語
    // 名前に連結した職位語を剥がす（「藤本聡准教授」→「藤本聡」）。長い職位語から順に評価。
    for (const w of POSITION_WORDS) {
      if (tok.endsWith(w) && tok.length > w.length) { tok = tok.slice(0, -w.length); break; }
    }
    if (POSITION_WORDS.includes(tok) || INVALID_TOKENS.has(tok)) continue; // 剥がした後の再チェック
    if (/^[0-9]+$/.test(tok)) continue;              // 数字のみ
    if (/[A-Za-z]/.test(tok)) hasLatin = true;
    nameParts.push(tok);
  }
  // 欧文名は空白で、和文名は連結（「John Smith」／「藤本聡」）
  const name = nameParts.join(hasLatin ? " " : "").trim();
  if (!name || INVALID_TOKENS.has(name)) return null;
  if (name.length < 2 && !/^[A-Za-z]/.test(name)) return null; // 単漢字の断片は無効
  if (TOPIC_SUFFIXES.some((t) => name.endsWith(t))) return null; // 「遺伝子工学」等のテーマ名は人名でない
  return name;
}
