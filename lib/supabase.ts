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
  sorbet_enrolled: boolean; 
};

export type StoreLookupResult = {
  id: string;
  public_code: string;
  name: string;
  ship_city: string | null;
  province: string | null;
};

export type StockLevel = "empty" | "almost_empty" | "half" | "three_quarter";

// Sorbet has the same 4 levels PLUS "own_freezer" for customers who sell sorbet
// from their existing freezer (no dedicated Mini Melts sorbet freezer needed).
// The DB enum `order_stock_level` now contains all 5 values.
export type SorbetStockLevel = StockLevel | "own_freezer";

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

export async function lookupStoresByEmail(email: string): Promise<StoreLookupResult[]> {
  const trimmed = email.trim();
  if (!trimmed) return [];
  const { data, error } = await getSupabase()
    .rpc("lookup_stores_by_email", { p_email: trimmed });
  if (error) {
    console.error("Email lookup error:", error);
    return [];
  }
  return (data as StoreLookupResult[]) || [];
}

// Returns true if the store already has an open (pending or scheduled) order.
// Backed by the store_has_open_order RPC (SECURITY DEFINER) so the public anon
// client can check without read access to the orders table. Fails open (returns
// false) on error so a transient RPC failure never blocks a legitimate order —
// the DB trigger remains the hard guardrail regardless.
export async function hasOpenOrder(storeId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .rpc("store_has_open_order", { p_store_id: storeId });
  if (error) {
    console.error("Open-order check error:", error);
    return false;
  }
  return data === true;
}

export type SubmitOrderInput = {
  store_id: string;
  stock_level: StockLevel;
  notes: string | null;
  submitted_by_name: string;
  submitted_by_phone: string | null;
  submitted_by_email: string | null;
  raw_form_payload: Record<string, unknown>;
  // Sorbet support. When includes_sorbet is true, sorbet_stock_level must be
  // set; when false, it must be null. The DB has a CHECK constraint enforcing
  // this so passing them through directly is safe — a bug in the UI will
  // produce a clear DB error instead of silent bad data.
  includes_sorbet: boolean;
  sorbet_stock_level: SorbetStockLevel | null;
};

export type SubmitOrderResult =
  | { success: true }
  | { success: false; error: string; duplicate?: boolean };

export async function submitOrder(input: SubmitOrderInput): Promise<SubmitOrderResult> {
  try {
    const { error } = await getSupabase()
      .from("orders")
      .insert({
        store_id: input.store_id,
        source: "online",
        status: "pending",
        stock_level: input.stock_level,
        notes: input.notes,
        submitted_by_name: input.submitted_by_name,
        submitted_by_phone: input.submitted_by_phone,
        submitted_by_email: input.submitted_by_email,
        raw_form_payload: input.raw_form_payload,
        includes_sorbet: input.includes_sorbet,
        sorbet_stock_level: input.sorbet_stock_level,
      });

    if (error) {
      console.error("Order submit error:", error);
      // Backstop: the DB trigger blocks a second open order for the same store
      // with a 'duplicate_open_order' exception. Detect it so the form can show
      // the friendly "order already in progress" message instead of a raw error.
      const raw = `${error.message || ""} ${(error as { details?: string }).details || ""} ${(error as { hint?: string }).hint || ""}`.toLowerCase();
      if (raw.includes("duplicate_open_order") || raw.includes("order in progress")) {
        return { success: false, duplicate: true, error: "This store already has an order in progress." };
      }
      return { success: false, error: error.message || "Could not save your order." };
    }
    return { success: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unexpected error submitting order.";
    console.error("Order submit exception:", e);
    return { success: false, error: msg };
  }
}
