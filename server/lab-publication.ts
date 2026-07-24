import type { Lab, LabMember } from "../shared/types";

export interface LabHomepageOverride {
  labId: string;
  url: string;
  label?: string;
  evidenceUrl?: string;
  checkedAt: string;
  note: string;
  publish?: boolean;
  applyAtRuntime?: boolean;
  keywords?: string[];
  replaceKeywords?: boolean;
  researchSummary?: string;
  researchQuestions?: string[];
  contentLevel?: "verified" | "sourced" | "basic";
  name?: string;
  department?: string;
  graduateSchool?: string;
  major?: string;
  members?: LabMember[];
}

export function applyLabHomepageOverrides(labs: Lab[], overrides: LabHomepageOverride[]): Lab[] {
  const byId = new Map(overrides.filter((override) => override.applyAtRuntime).map((override) => [override.labId, override]));

  return labs.map((lab) => {
    const override = byId.get(lab.id);
    if (!override || override.publish === false) return lab;

    const keywords = Array.from(new Set([
      ...(override.replaceKeywords ? [] : (lab.keywords || [])),
      ...(override.keywords || []),
    ]));
    const members = override.members?.length ? override.members : lab.members;
    const pi = members.find((member) => member.name.trim().length > 0) || lab.pi;
    const missingFields = (lab.quality?.missingFields || []).filter((field) =>
      field !== "研究室ホームページ" && !(override.keywords?.length && field === "具体的な研究キーワード"));
    const notes = [
      ...(lab.quality?.notes || []).filter((note) => !/確認できない|再確認/.test(note)),
      override.note,
    ];
    const contentLevel = override.contentLevel || lab.quality?.contentLevel || "basic";

    return {
      ...lab,
      name: override.name || lab.name,
      department: override.department || lab.department,
      graduate_school: override.graduateSchool || lab.graduate_school,
      major: override.major || lab.major,
      members,
      pi,
      member_count: members.length,
      keywords,
      researchQuestions: override.researchQuestions || lab.researchQuestions,
      questions: override.researchQuestions || lab.questions,
      official_url: override.url,
      has_url: true,
      sources: [{ label: override.label || "研究室ホームページ", url: override.url }],
      sections: {
        ...lab.sections,
        research_summary: override.researchSummary || lab.sections.research_summary,
      },
      last_updated: override.checkedAt,
      quality: {
        publicationLevel: contentLevel === "basic" ? "review" : "sourced",
        contentLevel,
        score: Math.max(lab.quality?.score || 0, 85),
        reviewStatus: "manually_researched",
        sourceKind: "lab_homepage",
        checkedAt: override.checkedAt,
        missingFields,
        notes,
      },
    };
  });
}

export const isPublicLab = (lab: Lab) =>
  (lab.status === "published" || lab.status === "claimed")
  && lab.quality?.sourceKind === "lab_homepage"
  && Boolean(lab.official_url);
