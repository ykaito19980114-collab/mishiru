const BASE=process.env.BASE||"http://localhost:3002";
const sessionId=`phase-b-${Date.now()}`;
const input={recentInterest:"都市で感じる安心感を行動データから捉えたい",discomfort:"アンケートだけではその場の変化が抜ける",graduateTopic:"都市サービスの体験評価",reason:"設計へ戻したい",referenceInfo:"",notes:""};
const request=async(path:string,init:RequestInit={})=>{const response=await fetch(BASE+path,{...init,headers:{"content-type":"application/json",...(init.headers||{})}});const type=response.headers.get("content-type")||"";const body=type.includes("json")?await response.json():await response.arrayBuffer();return{response,body};};
const post=(path:string,body:unknown)=>request(path,{method:"POST",body:JSON.stringify(body)});
const patch=(path:string,body:unknown)=>request(path,{method:"PATCH",body:JSON.stringify(body)});
const check=(condition:unknown,label:string)=>{if(!condition)throw new Error(`FAIL:${label}`);console.log(`PASS ${label}`);};

const step1=await post("/api/question-craft/step1",{sessionId,sourceMode:"free_input",freeInput:input,materials:[]});
check(step1.response.ok&&step1.body.step1.output_type_proposals.length===12,"Step1・12分類・AI未設定フォールバック");
const selectedRq=step1.body.step1.output_type_proposals[0];
const step2=await post("/api/question-craft/step2",{sessionId,freeInput:input,selectedRq,step1:step1.body.step1});
check(step2.response.ok&&step2.body.step2.research_outline.next_actions,"Step2・研究骨子");
const created=await post("/api/projects",{sessionId,displayTitle:"都市／安心感：相談用？*",subtitle:"日本語と特殊文字を含む出力テスト",status:"consultation",sourceMode:"free_input",freeInput:input,materials:[],step1Response:step1.body.step1,selectedRq,step2Response:step2.body.step2});
check(created.response.status===201&&created.body.project.dataset==="default","Project保存・dataset"); const project=created.body.project;
const isolated=await request(`/api/projects/${project.id}?sessionId=another-session`);check(isolated.response.status===404,"session分離");

for(const format of ["pdf","pptx_1","pptx_2","pptx_3"]){
  const preview=await post(`/api/projects/${project.id}/assets/preview`,{sessionId,format,options:{includeCover:true,includeComments:true,includeNextActions:true,includeMaterials:false,showEmpty:false}});check(preview.response.ok&&Object.keys(preview.body.draft.sections).length>0,`${format}生成前プレビュー`);
  const generated=await post(`/api/projects/${project.id}/assets`,{sessionId,format,draft:preview.body.draft});check(generated.response.status===201&&generated.body.asset.status==="ready",`${format}生成`);
  const downloaded=await request(`/api/projects/${project.id}/assets/${generated.body.asset.id}/download?sessionId=${sessionId}`);const bytes=new Uint8Array(downloaded.body);const magic=String.fromCharCode(...bytes.slice(0,4));check(downloaded.response.ok&&(format==="pdf"?magic==="%PDF":magic.startsWith("PK")),`${format}ダウンロード・ファイル署名`);
}
await new Promise((resolve)=>setTimeout(resolve,20));await patch(`/api/projects/${project.id}`,{sessionId,subtitle:"更新後の副題"});
const assets=await request(`/api/projects/${project.id}/assets?sessionId=${sessionId}`);check(assets.body.assets.every((item:any)=>item.status==="outdated"),"outdated判定");

const material={sourceType:"memo",sourceId:"memo-1",title:"街の安心感",sourceKeywords:["安心感","都市体験","行動データ"],userReaction:"気になる",userReasonMemo:"場所による感情の変化を知りたい",excerpt:"安心感は時間帯と人通りで変わるのではないか"};
const analyzed=await post("/api/interest-analysis",{sessionId,materials:[material],excludedSourceIds:[]});check(analyzed.response.status===201&&analyzed.body.analysis.result.analysisMode==="deterministic_fallback","みつめる手動フォールバック");
const limited=await post("/api/interest-analysis",{sessionId,materials:[material],excludedSourceIds:[]});check(limited.response.status===429,"本番相当の日次1回制限");
const reflected=await request(`/api/interest-analysis?sessionId=${sessionId}`);check(reflected.body.analysis.sourceSnapshot.length===1&&reflected.body.analysis.result.evidence.sourceIds.length===1,"根拠スナップショット");
console.log(`PHASE_B_PROJECT=${project.id} SESSION=${sessionId}`);
