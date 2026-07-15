import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const q = '藤本';
    const { data, error } = await supabase.from('university')
        .select('*')
        .or(`大学名.ilike.%${q}%,研究室名.ilike.%${q}%,教授名・職位.ilike.%${q}%,研究分野・キーワード.ilike.%${q}%`)
        .limit(1);
    
    console.log("No Quotes Error:", error?.message || 'Success');

    const { data: d2, error: e2 } = await supabase.from('university')
        .select('*')
        .or(`"大学名".ilike.%${q}%,"研究室名".ilike.%${q}%,"教授名・職位".ilike.%${q}%,"研究分野・キーワード".ilike.%${q}%`)
        .limit(1);
    console.log("Quotes Error:", e2?.message || 'Success');

    const { data: d3, error: e3 } = await supabase.from('university')
        .select('*')
        .order('No', { ascending: true })
        .limit(1);
    console.log("Order No Quotes Error:", e3?.message || 'Success');

    const { data: d4, error: e4 } = await supabase.from('university')
        .select('*')
        .order('"No"', { ascending: true })
        .limit(1);
    console.log("Order Quotes Error:", e4?.message || 'Success');
}

run();
