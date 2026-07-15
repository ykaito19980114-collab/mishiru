export function cleanDisplayLabel(value: string) {
  return value
    .replace(/[「」『』]/g, "")
    .replace(/[（）()]/g, " ")
    .replace(/[|｜]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[、,。\s]+|[、,。\s]+$/g, "")
    .trim();
}

export function uniqueCleanLabels(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanDisplayLabel(value);
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    result.push(cleaned);
  }
  return result;
}
