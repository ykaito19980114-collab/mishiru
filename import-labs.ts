import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import Papa from "papaparse";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importLabs() {
  const csvPath = path.resolve(process.cwd(), "labs.csv");
  if (!fs.existsSync(csvPath)) {
    console.error("labs.csv not found at", csvPath);
    console.log("Please save the provided CSV data as labs.csv in the root directory.");
    process.exit(1);
  }

  const csvContent = fs.readFileSync(csvPath, "utf8");
  
  // Parse CSV
  // Expected headers: No,大学名,学部・研究科・専攻,研究室名,教授名・職位,研究分野・キーワード,研究室URL,連絡手段（メール/電話/フォーム）,大学公式教員ページ,researchmap,収集回,備考,メール公開可否
  const parsed = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
  const rows = parsed.data as any[];

  console.log(`Parsed ${rows.length} rows from CSV.`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors: any[] = [];

  for (const row of rows) {
    try {
      const uName = row["大学名"];
      const dept = row["学部・研究科・専攻"];
      const labName = row["研究室名"];
      const piInfo = row["教授名・職位"] || "";
      const keywordsRaw = row["研究分野・キーワード"] || "";
      const officialUrl = row["研究室URL"];

      if (!uName || !piInfo) {
        skipCount++;
        continue;
      }

      // Determine univ type roughly
      let uType = "private";
      if (uName.includes("国立") || uName.includes("大学") && !uName.match(/立|私/)) {
        uType = "national"; // Simplified logic
      }

      // 1. Upsert University
      let slugBase = uName.replace(/大学$/, "").replace(/[^a-zA-Z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/g, '');
      
      const { data: univData, error: uError } = await supabase
        .from("universities")
        .select("id")
        .eq("name", uName)
        .maybeSingle();

      let univId = null;

      if (univData) {
        univId = univData.id;
      } else {
        const { data: newUniv, error: nuError } = await supabase
          .from("universities")
          .insert({
            name: uName,
            type: uType,
            slug: slugBase + "-" + Date.now().toString(36), // generate unique slug
          })
          .select("id")
          .single();

        if (nuError) throw new Error(`Univ Insert Error: ${nuError.message}`);
        univId = newUniv.id;
      }

      // 2. Parse PI
      let piName = piInfo;
      let piTitle = "";
      if (piInfo.includes("教授")) { piTitle = "教授"; piName = piInfo.replace("教授", "").trim(); }
      else if (piInfo.includes("准教授")) { piTitle = "准教授"; piName = piInfo.replace("准教授", "").trim(); }
      else if (piInfo.includes("講師")) { piTitle = "講師"; piName = piInfo.replace("講師", "").trim(); }
      else if (piInfo.includes("助教")) { piTitle = "助教"; piName = piInfo.replace("助教", "").trim(); }

      piName = piName.split("／")[0].split("/")[0].trim(); // Take first PI if multiple
      const lName = labName || `${piName}研究室`;

      // Keywords
      const keywords = keywordsRaw.split(/[、,・;；]/).map((k: string) => k.trim()).filter((k: string) => k);

      // Check if lab exists
      const { data: existingLab } = await supabase
        .from("labs")
        .select("id")
        .eq("university_id", univId)
        .eq("pi_name", piName)
        .maybeSingle();

      if (existingLab) {
        // Skip or update? Skip for now.
        skipCount++;
        continue;
      }

      const summary = `【分野・キーワード】${keywords.join(", ")}\n※本情報は自動収集・要約されたものです。詳細な研究内容は公式サイトをご覧ください。`;

      // Insert lab
      const { error: lError } = await supabase
        .from("labs")
        .insert({
          university_id: univId,
          name: lName,
          pi_name: piName,
          pi_title: piTitle,
          faculty: dept,
          research_summary: summary,
          keywords: keywords,
          official_url: officialUrl,
          source: 'scraped',
          is_published: true
        });

      if (lError) throw new Error(`Lab Insert Error: ${lError.message}`);

      successCount++;
    } catch (err: any) {
      errorCount++;
      errors.push({ row, error: err.message });
    }
  }

  console.log("=== Import Report ===");
  console.log(`Total Rows: ${rows.length}`);
  console.log(`Success: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Errors:  ${errorCount}`);

  if (errors.length > 0) {
    console.log("First 5 errors:", errors.slice(0, 5));
  }
}

importLabs().catch(console.error);
