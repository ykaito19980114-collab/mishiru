export const looksLikeAggregateLabName = (value: string) =>
  /全研究室|研究室群|各研究室|各分野|各領域|各専攻|講座群|連携研究室|教員一覧|担当教員一覧|研究室・教員一覧|ほか(?:\d+)?(?:研究室)?|他研究室|多数|主要分野/.test(value);

export const looksLikeResearcherProfile = (value: string) =>
  /researchmap\.jp|k-ris\.keio\.ac\.jp|r-info\.tohoku\.ac\.jp|research-db\.|researchers?\.|ridb\.|yudb\.|hyokadb|profs\.|elsevierpure\.com|search\.adb\.|(?:^|[./_-])rdb(?:[./_?-]|$)|nrid\.nii\.ac\.jp|kaken\.nii\.ac\.jp|jglobal\.jst\.go\.jp|orcid\.org|scholar\.google\.|cir\.nii\.ac\.jp|(?:^|[./_-])(?:faculty|staff|teacher|researcher|profile|people|members?|professors?)(?:[./_?-]|$)/i.test(value);

export const looksLikeAggregateLabPage = (value: string) =>
  /\/(?:labs?|laborator(?:y|ies)|research)\/?(?:index\.(?:html?|php))?(?:[?#].*)?$|\/(?:labs?|laborator(?:y|ies))\/list(?:[/?#]|$)|\/list(?:[/?#]|$)/i.test(value);
