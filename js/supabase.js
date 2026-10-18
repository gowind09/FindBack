const SUPABASE_URL = "https://xthcboxqiktvafdbqdxb.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Ia6eE5VZHlSAshCf_TxbLg_4hhpm04y";

const supabaseClient = window.supabase?.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
    : null;

if (!supabaseClient) {
    console.error("FindBack could not load Supabase. Check the network connection and reload the page.");
}
