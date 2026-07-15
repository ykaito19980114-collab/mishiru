import fs from "fs";
import path from "path";

type StsTag = { sourceType?: string; sourceId?: string; surface?: string; reviewStatus?: string; modality?: string; candidate_term?: string; generationMode?: string };
let cache: StsTag[] | null = null;

function tags() {
  if (cache) return cache;
  const dir=path.join(process.cwd(),"data","mishiru-sample-derived","stsmp","tags"); const rows:StsTag[]=[];
  try { for(const file of fs.readdirSync(dir).filter((name)=>name.endsWith(".tags.json"))){const value=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8"));if(Array.isArray(value))rows.push(...value);} } catch { /* STS-MP is optional */ }
  cache=rows; return rows;
}

export function stsmpMaterialMeta(sourceType:string,sourceId:string) {
  const matched=tags().filter((tag)=>tag.sourceType===sourceType&&tag.sourceId===sourceId&&tag.surface&&tag.modality!=="hypothesis");
  return {
    approvedTags:matched.filter((tag)=>tag.reviewStatus==="approved").map((tag)=>tag.surface!).slice(0,12),
    pendingTags:matched.filter((tag)=>tag.reviewStatus==="pending").map((tag)=>tag.surface!).slice(0,6),
    executionMode:matched.find((tag)=>tag.generationMode)?.generationMode,
  };
}
