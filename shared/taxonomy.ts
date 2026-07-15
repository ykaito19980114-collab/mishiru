// 研究分野タクソノミ（docs/03 §2.1 オブジェクトモデル）
// カードと研究室を接続する共通語彙。ユーザー表示名は label を用いる。

export interface ResearchArea {
  id: string;
  label: string;
  genre: HookGenre; // SCR-00 の関心入口ジャンルとの対応
}

// SCR-00 関心入口（docs/03 §8.5 確定コピー）
export type HookGenre = "health" | "making" | "info" | "nature" | "matter" | "logic";

export const HOOK_GENRES: { id: HookGenre; label: string }[] = [
  { id: "health", label: "からだと健康" },
  { id: "making", label: "機械とものづくり" },
  { id: "info", label: "情報とAI" },
  { id: "nature", label: "自然とエネルギー" },
  { id: "matter", label: "物質と材料" },
  { id: "logic", label: "数理と仕組みの探究" },
];

export const RESEARCH_AREAS: ResearchArea[] = [
  { id: "quantum", label: "量子科学", genre: "logic" },
  { id: "condensed-matter", label: "物性物理", genre: "matter" },
  { id: "materials", label: "材料・ナノテクノロジー", genre: "matter" },
  { id: "photonics", label: "光・レーザー", genre: "matter" },
  { id: "electronics", label: "半導体・エレクトロニクス", genre: "making" },
  { id: "communication", label: "通信・ネットワーク", genre: "info" },
  { id: "energy", label: "エネルギー・環境", genre: "nature" },
  { id: "plasma-space", label: "プラズマ・宇宙", genre: "nature" },
  { id: "mechanical", label: "機械・設計・製造", genre: "making" },
  { id: "fluid", label: "流体・熱工学", genre: "nature" },
  { id: "robotics", label: "ロボティクス・制御", genre: "making" },
  { id: "info-ai", label: "情報・AI・データ科学", genre: "info" },
  { id: "math", label: "数理科学・シミュレーション", genre: "logic" },
  { id: "bio", label: "生体・医工学", genre: "health" },
  { id: "chemistry", label: "化学・プロセス工学", genre: "matter" },
];

export const areaLabel = (id: string): string =>
  RESEARCH_AREAS.find((a) => a.id === id)?.label ?? id;

// キーワード → 分野タグの対応辞書（labs.csv正規化・カード接続に使用）
// 部分一致（includes）で評価する。順序は特異度の高いものを先に。
export const KEYWORD_AREA_DICT: [string, string][] = [
  ["量子情報", "quantum"], ["量子光学", "quantum"], ["量子計算", "quantum"], ["量子コンピュ", "quantum"],
  ["量子物性", "condensed-matter"], ["量子", "quantum"],
  ["超伝導", "condensed-matter"], ["強相関", "condensed-matter"], ["低温", "condensed-matter"],
  ["磁性", "condensed-matter"], ["スピン", "condensed-matter"], ["トポロジ", "condensed-matter"],
  ["物性", "condensed-matter"], ["表面", "materials"], ["界面", "materials"],
  ["ナノ", "materials"], ["結晶", "materials"], ["薄膜", "materials"], ["材料", "materials"],
  ["マテリアル", "materials"], ["金属", "materials"], ["セラミ", "materials"], ["高分子", "chemistry"],
  ["レーザー", "photonics"], ["レーザ", "photonics"], ["フォトニクス", "photonics"],
  ["光デバイス", "photonics"], ["光物性", "photonics"], ["光学", "photonics"], ["放射光", "condensed-matter"],
  ["テラヘルツ", "photonics"], ["光", "photonics"],
  ["半導体", "electronics"], ["集積回路", "electronics"], ["デバイス", "electronics"],
  ["エレクトロニクス", "electronics"], ["トランジスタ", "electronics"], ["電子工学", "electronics"],
  ["パワエレ", "energy"], ["パワーエレクトロニクス", "energy"], ["電力", "energy"],
  ["エネルギー", "energy"], ["電池", "energy"], ["太陽電池", "energy"], ["水素", "energy"], ["環境", "energy"],
  ["プラズマ", "plasma-space"], ["核融合", "plasma-space"], ["宇宙", "plasma-space"], ["超高層", "plasma-space"],
  ["通信", "communication"], ["ネットワーク", "communication"], ["無線", "communication"], ["アンテナ", "communication"],
  ["情報セキュリティ", "info-ai"], ["セキュリティ", "info-ai"],
  ["機械学習", "info-ai"], ["人工知能", "info-ai"], ["AI", "info-ai"], ["データ", "info-ai"],
  ["画像処理", "info-ai"], ["信号処理", "info-ai"], ["情報", "info-ai"], ["計算機", "info-ai"], ["ソフトウェア", "info-ai"],
  ["自然言語処理", "info-ai"], ["深層学習", "info-ai"], ["ウェアラブル", "info-ai"], ["ユビキタス", "info-ai"],
  ["コンピューティング", "info-ai"], ["HCI", "info-ai"], ["知能", "info-ai"], ["AR", "info-ai"], ["VR", "info-ai"],
  ["プロジェクション", "info-ai"],
  ["ロボット", "robotics"], ["ロボティクス", "robotics"], ["制御", "robotics"], ["メカトロ", "robotics"],
  ["自動運転", "robotics"], ["ヒューマンインタ", "robotics"], ["アンドロイド", "robotics"], ["HRI", "robotics"],
  ["マニピュレーション", "robotics"],
  ["流体", "fluid"], ["乱流", "fluid"], ["熱工学", "fluid"], ["伝熱", "fluid"], ["燃焼", "fluid"], ["航空", "fluid"],
  ["機械", "mechanical"], ["設計", "mechanical"], ["加工", "mechanical"], ["生産", "mechanical"],
  ["構造", "mechanical"], ["振動", "mechanical"], ["トライボロジ", "mechanical"], ["溶接", "mechanical"],
  ["非破壊", "mechanical"], ["衝突安全", "mechanical"], ["工学全般", "mechanical"],
  ["状態図", "materials"], ["ミクロ組織", "materials"], ["MEMS", "electronics"], ["空気力学", "fluid"],
  ["生体", "bio"], ["バイオ", "bio"], ["医用", "bio"], ["医療", "bio"], ["細胞", "bio"], ["脳", "bio"],
  ["神経", "bio"], ["生命", "bio"], ["福祉", "bio"], ["リハビリ", "bio"],
  ["触媒", "chemistry"], ["化学", "chemistry"], ["合成", "chemistry"], ["プロセス", "chemistry"], ["分子", "chemistry"],
  ["数理", "math"], ["数値", "math"], ["シミュレーション", "math"], ["統計", "math"], ["解析", "math"],
  ["理論", "math"], ["モデリング", "math"], ["アルゴリズム", "math"], ["最適化", "math"],
];

export function inferAreaTags(keywords: string[]): string[] {
  const tags = new Set<string>();
  for (const kw of keywords) {
    for (const [needle, area] of KEYWORD_AREA_DICT) {
      if (kw.includes(needle)) {
        tags.add(area);
        break; // 1キーワードにつき最初にヒットした分野のみ（特異度優先）
      }
    }
  }
  return Array.from(tags);
}
