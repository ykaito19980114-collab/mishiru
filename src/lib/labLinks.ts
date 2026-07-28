import type { Lab } from "../../shared/types";

export function googleScholarUrlForLab(
  lab: Pick<Lab, "google_scholar_url" | "pi" | "university">,
) {
  return lab.google_scholar_url
    || `https://scholar.google.com/scholar?q=${encodeURIComponent(`"${lab.pi.name}" ${lab.university.name}`)}`;
}

export function researchDatabaseLinks(
  lab: Pick<Lab, "google_scholar_url" | "pi" | "university" | "suppress_cinii_link">,
) {
  return [
    { id: "researchmap", label: "researchmap", url: `https://researchmap.jp/researchers?q=${encodeURIComponent(lab.pi.name)}` },
    { id: "cinii", label: "CiNii Research", url: `https://cir.nii.ac.jp/all?q=${encodeURIComponent(lab.pi.name)}` },
    { id: "kaken", label: "KAKEN(科研費)", url: `https://kaken.nii.ac.jp/ja/search/?qm=${encodeURIComponent(lab.pi.name)}` },
    { id: "scholar", label: "Google Scholar", url: googleScholarUrlForLab(lab) },
  ].filter((link) => link.id !== "cinii" || !lab.suppress_cinii_link);
}
