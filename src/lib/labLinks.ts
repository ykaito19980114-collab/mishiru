import type { Lab } from "../../shared/types";

export function googleScholarUrlForLab(
  lab: Pick<Lab, "google_scholar_url" | "pi" | "university">,
) {
  return lab.google_scholar_url
    || `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${lab.pi.name}" ${lab.university.name}`)}`;
}
