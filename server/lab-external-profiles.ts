import type { Lab } from "../shared/types";

export interface LabExternalProfileOverride {
  labId: string;
  googleScholarUrl?: string;
  checkedAt: string;
  note: string;
}

export function applyLabExternalProfileOverrides(
  labs: Lab[],
  overrides: LabExternalProfileOverride[],
): Lab[] {
  const byId = new Map(overrides.map((override) => [override.labId, override]));

  return labs.map((lab) => {
    const override = byId.get(lab.id);
    if (!override?.googleScholarUrl) return lab;

    return {
      ...lab,
      google_scholar_url: override.googleScholarUrl,
      last_updated: override.checkedAt,
    };
  });
}
