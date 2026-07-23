// FR-LAB-01 の全10項目が埋まった「公認研究室ページ」の見本（教授営業の見本＝SCR-05/09で提示）。
// 実在の1件（lab-1 藤本研究室）を素材に、学生向け翻訳・日常・進路等を運営が編集した想定の完成形。
// is_demo=true として一覧・マッチング対象からは除外し、/labs/demo-lab で見本として参照する。
import type { Lab } from "../shared/types";

export const DEMO_LAB: Lab = {
  id: "demo-lab",
  name: "強相関系理論（藤本研究室）｜公認ページ見本",
  university: { name: "大阪大学", prefecture: "大阪府", region: "関西" },
  university_type: "national",
  department: "大学院基礎工学研究科 物質創成専攻",
  graduate_school: "大学院基礎工学研究科",
  major: "物質創成専攻",
  members: [{ name: "藤本聡", title: "教授" }],
  pi: { name: "藤本聡", title: "教授" },
  member_count: 1,
  keywords: ["強相関電子系理論", "超伝導", "トポロジカル物質"],
  area_tags: ["condensed-matter", "quantum"],
  field_major: "physics-space",
  official_url: "http://www.fujimotolab.mp.es.osaka-u.ac.jp/",
  has_url: true,
  sources: [
    { label: "研究室ホームページ", url: "http://www.fujimotolab.mp.es.osaka-u.ac.jp/" },
  ],
  sections: {
    research_summary:
      "電子どうしが強く影響し合う「強相関電子系」を理論から解き明かす研究室です。超伝導やトポロジカルな性質など、多数の電子が集まって初めて現れる現象を、数式とシミュレーションで説明することを目指します（公開情報をもとに学生向けに再構成した紹介です）。",
    student_themes: [
      "新しい超伝導体で電子がどうペアを組むかの理論モデル化",
      "トポロジカル物質の表面に現れる特別な電子状態の解析",
      "強相関系の数値シミュレーション手法の改良",
    ],
    methods: ["理論", "数値シミュレーション"],
    key_papers: [
      { title: "強相関電子系における超伝導機構に関する理論研究", note: "テーマ例（詳細・一覧は研究室ホームページをご確認ください）" },
    ],
    daily_life:
      "実験装置を扱うのではなく、論文を読み、数式を立て、計算機で数値を確かめる時間が中心です。週1回のゼミで進捗と論文紹介を行う想定の紹介です。",
    mentoring: "ゼミでの議論を中心に、理論の基礎から個別テーマまで段階的に指導する体制（一般的な理論系研究室の例として記載。詳細は要問い合わせ）。",
    careers: "アカデミア（博士進学・研究者）のほか、データ解析・シミュレーションのスキルを活かした製造業・IT分野への進路が一般的です（分野一般の傾向）。",
    fit: {
      suited: "数式で自然の仕組みを説明することに喜びを感じ、地道な計算を粘り強く続けられる人。",
      not_suited: "手を動かす実験や、装置づくり・ものづくりを研究の中心にしたい人には別分野が向くかもしれません。",
    },
    collaboration: "新物質の電子状態理論、超伝導・トポロジカル物性の理論解析に関する共同研究・相談。",
  },
  status: "claimed",
  verified: true,
  confidence: "verified",
  last_updated: "2026-07-03",
  is_demo: true,
  quality: {
    publicationLevel: "sourced",
    contentLevel: "verified",
    score: 100,
    reviewStatus: "manually_researched",
    sourceKind: "lab_homepage",
    checkedAt: "2026-07-23",
    missingFields: [],
  },
};
