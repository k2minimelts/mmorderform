import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase env vars missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel project settings."
    );
  }
  _supabase = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _supabase;
}

export type StorePublicInfo = {
  id: string;
  public_code: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  ship_addr1: string | null;
  ship_city: string | null;
  province: string | null;
  ship_postal: string | null;
  active: boolean;
};

export type StockLevel = "empty" | "almost_empty" | "half" | "three_quarter";

export async function lookupStoreByCode(code: string): Promise<StorePublicInfo | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await getSupabase()
    .from("store_public_info")
    .select("*")
    .eq("public_code", normalized)
    .maybeSingle();

  if (error) {
    console.error("Store lookup error:", error);
    return null;
  }
  return data as StorePublicInfo | null;
}

export async function submitOrder(input: {
  store_id: string;
  stock_level: StockLevel;
  notes: string | null;
  submitted_by_name: string;
  submitted_by_phone: string | null;
  submitted_by_email: string | null;
  raw_form_payload: Record<string, unknown>;
}): Promise<{ success: boolean; error?: string }> {
  const { error } = await getSupabase()
    .from("orders")
    .insert({
      store_id: input.store_id,
      source: "online",
      stock_level: input.stock_level,
      notes: input.notes,
      submitted_by_name: input.submitted_by_name,
      submitted_by_phone: input.submitted_by_phone,
      submitted_by_email: input.submitted_by_email,
      raw_form_payload: input.raw_form_payload,
      status: "pending",
    });

  if (error) {
    return { success: false, error: error.message };
  }
  return { success: true };
}
