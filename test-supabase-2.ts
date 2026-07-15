import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const { data: d1, error: e1 } = await supabase.from('university')
        .select('*')
        .eq('"大学名"', '大阪大学')
        .limit(1);
    console.log("eq Quotes Error:", e1?.message || 'Success');

    const { data: d2, error: e2 } = await supabase.from('university')
        .select('*')
        .eq('大学名', '大阪大学')
        .limit(1);
    console.log("eq No Quotes Error:", e2?.message || 'Success');
}

run();
