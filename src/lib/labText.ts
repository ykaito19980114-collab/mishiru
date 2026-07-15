import type { Lab } from "../../shared/types";
import { fieldLabel } from "../../shared/fields";
import { cleanDisplayLabel } from "../../shared/text";

const UNIVERSITY_CITY: Record<string, string> = {
  "北海道大学": "札幌市",
  "東北大学": "仙台市",
  "筑波大学": "つくば市",
  "東京大学": "文京区",
  "東京科学大学": "目黒区",
  "東京工業大学": "目黒区",
  "一橋大学": "国立市",
  "横浜国立大学": "横浜市",
  "名古屋大学": "名古屋市",
  "京都大学": "京都市",
  "大阪大学": "吹田市",
  "神戸大学": "神戸市",
  "広島大学": "東広島市",
  "九州大学": "福岡市",
  "慶應義塾大学": "港区",
  "早稲田大学": "新宿区",
  "上智大学": "千代田区",
  "明治大学": "千代田区",
  "立命館大学": "京都市",
  "同志社大学": "京都市",
  "関西大学": "吹田市",
  "関西学院大学": "西宮市",
};

const stripParens = (value: string) => value.replace(/[（(].*?[）)]/g, "").trim();
const pick = (items: string[], fallback: string) => items.find((x) => x && x.trim().length > 0)?.trim() || fallback;
const cleanKeyword = (value: string) => value
  .split(/[、,]/)
  .map(cleanDisplayLabel)
  .find(Boolean) || "";

export function labLocation(lab: Lab) {
  const city = UNIVERSITY_CITY[lab.university.name];
  return city ? `${lab.university.prefecture}${city}` : lab.university.prefecture;
}

export function displayLabName(lab: Pick<Lab, "name">) {
  const name = stripParens(lab.name);
  if (!name) return "研究室";
  if (/(研究室|分野|講座|部門|センター|グループ|ラボ|領域|コース|ユニット)$/.test(name)) return name;
  return `${name}研究室`;
}

export function labQuestionSeeds(lab: Lab) {
  const primary = cleanKeyword(pick(lab.keywords, stripParens(lab.name) || fieldLabel(lab.field_major)));
  const secondary = cleanKeyword(lab.keywords.find((k) => cleanKeyword(k) !== primary) || stripParens(lab.name) || fieldLabel(lab.field_major));
  return { primary, secondary, labCore: cleanKeyword(stripParens(lab.name) || primary) };
}

export function labQuestions(lab: Lab, limit = 2) {
  const sourced = (lab.researchQuestions || []).map((q) => q.trim()).filter(Boolean);
  if (sourced.length) return sourced.slice(0, limit);
  const { primary, secondary, labCore } = labQuestionSeeds(lab);
  const questions = [
    researchQuestion(primary, lab.field_major, "primary"),
    secondary !== primary
      ? researchQuestion(secondary, lab.field_major, "secondary")
      : `${labCore}では、まだうまく説明できていない現象をどう捉えようとしているのか？`,
    `${labCore}では、${primary}のどの性質に注目し、どんな仕組みを説明しようとしているのか？`,
  ];
  return questions.slice(0, limit);
}

export function mainLabQuestion(lab: Lab) {
  return labQuestions(lab, 1)[0];
}

export function researchQuestion(term: string, field: Lab["field_major"], role: "primary" | "secondary" = "primary") {
  const t = cleanKeyword(term);
  if (/自然言語|機械翻訳|言語|文章|対話|意味/.test(t)) return `${t}は、人の言葉の意味や文脈をどこまで扱えるのか？`;
  if (/人工知能|機械学習|AI|データ|知能|情報処理/.test(t)) return `${t}で、複雑な現象や判断をどこまで説明できるのか？`;
  if (/水中音響|海洋音響|水産音響|海中音響|魚群探知|エコーロケーション/.test(t)) return `水中の音を手がかりに、海の生きものや環境をどう捉えるのか？`;
  if (/空力音響|航空|流体音響|騒音|低騒音|静音/.test(t)) return `流れや機械が生む騒音を、どう予測し、静かな設計へつなげるのか？`;
  if (/建築音響|室内音響|空間音響|音場|サウンドスケープ/.test(t)) return `建物や公共空間の音環境を、どう測り、聞きやすさへ設計するのか？`;
  if (/音声|聴覚|心理音響|音響信号|音情報|音楽/.test(t)) return `声や音に含まれる情報を、どう取り出し、人の理解につなげるのか？`;
  if (/音響|音|振動|波動/.test(t)) return `音や振動から何を読み取り、どう静かで安全な設計へつなげるのか？`;
  if (/ロボット|メカトロニクス|制御|機械力学|機械/.test(t)) return `${t}は、予測しにくい環境でどう安定して動けるのか？`;
  if (/熱|伝熱|燃焼|温度|エネルギー/.test(t)) return `${t}は、どんな条件で移動し、どう効率よく使えるのか？`;
  if (/流体|水流|気流|乱流|空力|流れ/.test(t)) return `${t}は、複雑な流れの中でどんな力や変化を生むのか？`;
  if (/構造|強度|破壊|疲労|耐震|安全/.test(t)) return `${t}は、どの条件で壊れにくさや安全性が決まるのか？`;
  if (/衛星|通信|ネットワーク|光導波路|レーザー|半導体|電子|回路/.test(t)) return `${t}で、情報やエネルギーをどこまで精密に運べるのか？`;
  if (/タンパク|蛋白|分子|細胞|遺伝子|ゲノム|生体|生命/.test(t)) return `${t}は、どんな仕組みで形や働きが生まれるのか？`;
  if (/植物|生態|環境|気候|農|食|食品/.test(t)) return `${t}は、環境や生きものの変化とどう関わっているのか？`;
  if (/材料|化学|触媒|プロセス|ウェーハ|高分子|金属/.test(t)) return `${t}は、どんな条件で性質や反応が変わるのか？`;
  if (/医療|福祉|看護|疾患|薬|臨床|画像/.test(t)) return `${t}は、診断やケアのどの場面を変えようとしているのか？`;
  if (/都市|建築|土木|地域|デザイン|空間/.test(t)) return `${t}は、人の暮らしや地域の使われ方をどう変えるのか？`;
  if (/心理|教育|学習|感情|認知|行動/.test(t)) return `${t}は、人の学びや判断のどんな仕組みを探っているのか？`;
  if (field === "info-math") return role === "primary" ? `${t}で、見えにくいパターンをどう読み解くのか？` : `${t}は、どんな現象をモデルとして表そうとしているのか？`;
  if (field === "life-bio" || field === "medical") return `${t}は、生命やからだのどんな仕組みに関わっているのか？`;
  if (field === "eee-mech" || field === "material-chem") return `${t}では、どの条件が働き方を変え、どんな応用につながるのか？`;
  if (field === "arch-civil") return `${t}は、人やまちの体験をどう設計し直すのか？`;
  return `この研究室では、${t}のどの性質に注目し、どんな仕組みを説明しようとしているのか？`;
}

export function labQuestionIntro(lab: Lab) {
  const { primary } = labQuestionSeeds(lab);
  return `公開情報では「${primary}」などが手がかりです。研究室固有のテーマに寄せて、問いとして読むと入口が見えやすくなります。`;
}

export function verificationText(verified: boolean) {
  return verified ? "研究室確認済み" : "研究室未確認";
}
