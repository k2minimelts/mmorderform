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
  sorbet_only: boolean;
  // Minimum sorbet cases when the order contains no ice cream (a driver going
  // out for sorbet alone needs a worthwhile load). NULL = no minimum.
  sorbet_min_cases: number | null;
  // Capacity of the store's sorbet freezer in cases. NULL = unknown.
  sorbet_freezer_cases: number | null;
};

export type StoreLookupResult = {
  id: string;
  public_code: string;
  name: string;
  ship_city: string | null;
  province: string | null;
};

export type StockLevel = "empty" | "almost_empty" | "half" | "three_quarter";

// Retained for historical rows only. Sorbet is no longer described by a
// freezer-fullness level — the order form collects per-flavour cases instead
// (see SorbetLine). "own_freezer" is retired and no longer offered.
export type SorbetStockLevel = StockLevel | "own_freezer";

// One flavour's requested quantity, in CASES (24 pouches per case).
// `flavour` must match the driver app's product names exactly so a line can be
// reconciled against what actually gets delivered.
export type SorbetLine = {
  flavour: string;
  cases: number;
};

// Backed by the lookup_store_by_code RPC (SECURITY DEFINER) so the public anon
// client can resolve ONE store without holding blanket SELECT on the
// store_public_info view — that grant allowed enumerating contact details for
// every store. Same pattern as lookup_stores_by_email / store_has_open_order.
// The RPC returns the identical column shape as the view, so StorePublicInfo is
// unchanged; it just arrives as a 0-or-1 row array.
export async function lookupStoreByCode(code: string): Promise<StorePublicInfo | null> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await getSupabase()
    .rpc("lookup_store_by_code", { p_code: normalized });

  if (error) {
    console.error("Store lookup error:", error);
    return null;
  }
  const rows = (data as StorePublicInfo[] | null) || [];
  return rows.length > 0 ? rows[0] : null;
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

// PAD status for the order form's October 1 notice.
//
// 'required' means this store is still on COD with no active pre-authorized
// debit mandate. Anything else ('ok') covers stores that have signed, EDI
// accounts, genuine terms accounts, and any store the office has moved off COD
// to agree something different — so an exception is granted by changing the
// store's terms in the dashboard, not by a separate flag.
//
// Fails OPEN (returns 'ok'): a transient RPC error must never show a customer a
// payment warning we are not sure applies to them.
// 'blocked' is returned once app_config.pad_block_orders_from has passed
// (midnight Eastern, Oct 1): the form stops at the block screen instead of
// showing the warning banner. The DB trigger enforces the same rule on insert.
export type PadStatus = "ok" | "required" | "blocked";

export async function getStorePadStatus(code: string): Promise<PadStatus> {
  const normalized = code.trim().toUpperCase();
  const { data, error } = await getSupabase()
    .rpc("get_store_pad_status", { p_code: normalized });
  if (error) {
    console.error("PAD status error:", error);
    return "ok";
  }
  return data === "required" || data === "blocked" ? data : "ok";
}

// Asks the server to email this store its signing link.
//
// The link is never returned to the browser. The order form authenticates only
// a store code, and that code is printed on every delivery receipt — handing
// back a signing token would let anyone with a receipt authorize bank debits
// against the store. The edge function emails it to the address already on the
// store record instead, so whoever asks must control that mailbox.
export async function requestPadLink(
  publicCode: string
): Promise<{ ok: boolean; sent?: boolean; sentTo?: string | null; throttled?: boolean }> {
  const { data, error } = await getSupabase().functions.invoke("request-pad-link", {
    body: { public_code: publicCode.trim().toUpperCase() },
  });
  if (error) {
    console.error("PAD link request error:", error);
    return { ok: false };
  }
  const d = (data ?? {}) as { ok?: boolean; sent?: boolean; sent_to?: string | null; throttled?: boolean };
  return { ok: d.ok === true, sent: d.sent, sentTo: d.sent_to ?? null, throttled: d.throttled };
}

// Self-serve BYO sorbet (Option B): flips the store to sorbet-enrolled with
// their own -18°C freezer — no agreement, no Mini Melts freezer. Calls the
// enroll-sorbet-own-freezer edge function (public; it performs the service-role
// write server-side, so the anon client never touches the stores table directly).
export async function enrollSorbetOwnFreezer(
  publicCode: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await getSupabase().functions.invoke(
    "enroll-sorbet-own-freezer",
    { body: { public_code: publicCode } }
  );
  if (error) {
    console.error("Sorbet own-freezer enroll error:", error);
    return { ok: false, error: error.message };
  }
  const d = (data ?? {}) as { ok?: boolean; error?: string };
  if (d.ok) return { ok: true };
  return { ok: false, error: d.error || "enroll_failed" };
}

// Sorbet freezer gate (Oct 2026). Sorbet is open to every store; the first time
// a store orders it, it says where the sorbet will be kept. 'ask' = this store
// has never answered (and never received sorbet), so the form must ask. Fails
// open to 'ok': the DB trigger still treats an unanswered first order as
// needing a freezer, so nothing is lost if this lookup errors.
export type SorbetGate = "ask" | "ok";
export type SorbetFreezerAnswer = "ours" | "needs_ours" | "own";

export async function getStoreSorbetGate(code: string): Promise<SorbetGate> {
  const { data, error } = await getSupabase()
    .rpc("get_store_sorbet_gate", { p_code: code.trim().toUpperCase() });
  if (error) {
    console.error("Sorbet gate error:", error);
    return "ok";
  }
  return data === "ask" ? "ask" : "ok";
}

export type SubmitOrderInput = {
  store_id: string;
  // null for sorbet-only stores (no ice cream); the DB column is nullable.
  stock_level: StockLevel | null;
  notes: string | null;
  submitted_by_name: string;
  submitted_by_phone: string | null;
  submitted_by_email: string | null;
  raw_form_payload: Record<string, unknown>;
  // Sorbet support. When includes_sorbet is true the order must carry either a
  // legacy sorbet_stock_level or sorbet_lines; the DB CHECK constraint
  // orders_sorbet_consistency enforces this, so passing them through directly
  // is safe — a bug in the UI produces a clear DB error, not silent bad data.
  // New orders send sorbet_lines and leave sorbet_stock_level null.
  includes_sorbet: boolean;
  sorbet_stock_level: SorbetStockLevel | null;
  sorbet_lines: SorbetLine[] | null;
  // First sorbet order only (see getStoreSorbetGate); null otherwise.
  sorbet_freezer_answer?: SorbetFreezerAnswer | null;
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
        sorbet_lines: input.sorbet_lines,
        sorbet_freezer_answer: input.sorbet_freezer_answer ?? null,
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
