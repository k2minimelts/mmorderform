"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  lookupStoreByCode,
  lookupStoresByEmail,
  submitOrder,
  hasOpenOrder,
  getStorePadStatus,
  getStoreSorbetGate,
  requestPadLink,
  StorePublicInfo,
  StoreLookupResult,
  StockLevel,
  PadStatus,
  SorbetGate,
  SorbetFreezerAnswer,
} from "@/lib/supabase";
import {
  EmailLookupView,
  EmailPickerView,
  NotACustomerView,
} from "./EmailLookupViews";

type Step =
  | "loading"
  | "lookup"
  | "email_lookup"
  | "email_picker"
  | "not_a_customer"
  | "confirm"
  | "stock"
  | "duplicate_order"
  | "pad_blocked"
  | "submitting"
  | "done"
  | "error";

// get_store_pad_status returns 'ok' | 'required' (warning phase, until the
// cutover) | 'blocked' (after the cutover). 'blocked' is widened here so this
// file does not depend on the PadStatus union in lib/supabase.ts being updated.
type PadGate = PadStatus | "blocked";

const STOCK_OPTIONS: { value: StockLevel; en: string; fr: string; icon: string }[] = [
  { value: "empty", en: "Empty", fr: "Vide", icon: "\u{1F4ED}" },
  { value: "almost_empty", en: "Almost empty", fr: "Presque vide", icon: "\u{1F4E6}" },
  { value: "half", en: "Half full", fr: "Moiti\u00E9 pleine", icon: "\u{1F5C4}\u{FE0F}" },
  { value: "three_quarter", en: "3/4 full", fr: "3/4 pleine", icon: "\u{1F5C3}\u{FE0F}" },
];

// Sorbet is ordered by the CASE, per flavour — not by freezer fullness. Unlike
// ice cream (loose DSD, the driver judges the refill), sorbet ships as whole
// 24-pouch cases and the store knows what sells. These strings must match the
// driver app's PRODUCTS list exactly so an order line reconciles against the
// delivery. Product names are brand SKUs and are not translated.
const SORBET_FLAVOURS = ["BIG Cherry", "BIG Mango", "BIG Kiwi"] as const;

function sorbetTotal(cases: Record<string, number>): number {
  return SORBET_FLAVOURS.reduce((n, f) => n + (cases[f] || 0), 0);
}

// The minimum exists so a driver isn't sent out for a token load. It is a
// property of the ORDER, not the store: an order that also contains ice cream
// is exempt because the driver is making the trip anyway. Gating on the order
// shape rather than store.sorbet_only keeps this correct if a both-products
// store is ever allowed to submit sorbet on its own.
function sorbetCasesOk(args: {
  total: number;
  orderHasIceCream: boolean;
  minCases: number | null;
  freezerCases: number | null;
}): boolean {
  const { total, orderHasIceCream, minCases, freezerCases } = args;
  if (total <= 0) return false;
  if (freezerCases && total > freezerCases) return false;
  if (!orderHasIceCream && minCases && total < minCases) return false;
  return true;
}

// Where non-enrolled stores are sent to sign up for sorbet. Sorbet needs its own
// -18C freezer (the Mini Melts freezer runs at -35C), so a store must be enrolled
// before it can order sorbet. The store code is appended so the application can
// attach to the existing store.
// TODO(k2): point this at the real sorbet application flow once it's built.

function OrderFormInner() {
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("s") || searchParams.get("store") || "";

  const [step, setStep] = useState<Step>("loading");
  const [codeInput, setCodeInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailMatches, setEmailMatches] = useState<StoreLookupResult[]>([]);
  const [emailLookupError, setEmailLookupError] = useState("");
  const [store, setStore] = useState<StorePublicInfo | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [stockLevel, setStockLevel] = useState<StockLevel | null>(null);
  // Sorbet additions: independent of ice cream stock level. Sorbet is ordered
  // per flavour in cases; when the customer says no to sorbet the map is reset
  // to empty and we send null to the DB.
  const [includesSorbet, setIncludesSorbet] = useState<boolean>(false);
  const [sorbetCases, setSorbetCases] = useState<Record<string, number>>({});
  // Sorbet freezer gate: 'ask' for a store's first-ever sorbet order.
  const [sorbetGate, setSorbetGate] = useState<SorbetGate>("ok");
  const [freezerAnswer, setFreezerAnswer] = useState<SorbetFreezerAnswer | null>(null);
  const [ownFreezerConfirmed, setOwnFreezerConfirmed] = useState(false);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  // October 1 PAD changeover. 'required' only for stores still on COD with no
  // active mandate — a store that has signed never sees the notice.
  // After the cutover (app_config.pad_block_orders_from, midnight Eastern Oct 1)
  // it returns 'blocked' and the form stops at PadBlockedView instead.
  const [padStatus, setPadStatus] = useState<PadGate>("ok");

  function applyStoreToForm(result: StorePublicInfo) {
    setStore(result);
    const name = [result.first_name, result.last_name].filter(Boolean).join(" ");
    setContactName(name);
    setContactPhone(result.phone || "");
    setContactEmail(result.email || "");
  }

  // After a store is resolved, send the customer to the confirm step UNLESS the
  // store already has an open (pending/scheduled) order — in which case route to
  // the duplicate_order view so they find out immediately, before filling
  // anything in. The DB trigger is the hard guardrail; this is the friendly UX.
  async function routeAfterStoreResolved(result: StorePublicInfo) {
    applyStoreToForm(result);
    // Run both checks together: neither blocks the order today, and doing them
    // in parallel keeps the step transition as fast as it was before.
    const [open, pad, sGate] = await Promise.all([
      hasOpenOrder(result.id),
      getStorePadStatus(result.public_code),
      getStoreSorbetGate(result.public_code),
    ]);
    setSorbetGate(sGate);
    setFreezerAnswer(null);
    setOwnFreezerConfirmed(false);
    const gate = pad as PadGate;
    setPadStatus(gate);
    // An open order still shows the duplicate view: it is the more useful answer
    // for a customer checking on an order already in progress.
    setStep(open ? "duplicate_order" : gate === "blocked" ? "pad_blocked" : "confirm");
  }

  useEffect(() => {
    if (codeParam) {
      (async () => {
        const result = await lookupStoreByCode(codeParam);
        if (result) {
          await routeAfterStoreResolved(result);
        } else {
          setCodeInput(codeParam);
          setErrorMsg("Code not found. Please check and try again.");
          setStep("lookup");
        }
      })();
    } else {
      setStep("lookup");
    }
  }, [codeParam]);

  async function handleManualLookup() {
    setErrorMsg("");
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    setStep("loading");
    const result = await lookupStoreByCode(trimmed);
    if (result) {
      await routeAfterStoreResolved(result);
    } else {
      setErrorMsg("Code not found. Please double-check or look it up by email below. / Code introuvable.");
      setStep("lookup");
    }
  }

  async function handleEmailLookup() {
    setEmailLookupError("");
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailLookupError("Please enter a valid email address.");
      return;
    }
    setStep("loading");
    const matches = await lookupStoresByEmail(trimmed);
    if (matches.length === 0) {
      setStep("not_a_customer");
      return;
    }
    if (matches.length === 1) {
      const full = await lookupStoreByCode(matches[0].public_code);
      if (full) {
        await routeAfterStoreResolved(full);
      } else {
        setErrorMsg("Could not load store details.");
        setStep("error");
      }
      return;
    }
    setEmailMatches(matches);
    setStep("email_picker");
  }

  async function handlePickFromMatches(match: StoreLookupResult) {
    setStep("loading");
    const full = await lookupStoreByCode(match.public_code);
    if (full) {
      await routeAfterStoreResolved(full);
    } else {
      setErrorMsg("Could not load store details.");
      setStep("error");
    }
  }

  async function handleSubmit() {
    if (!store) return;
    const sorbetOnly = !!store.sorbet_only;
    // A sorbet-only store places an order with no ice cream on it.
    const orderHasIceCream = !sorbetOnly;
    if (orderHasIceCream && !stockLevel) return;
    const wantsSorbet = sorbetOnly || includesSorbet;
    const total = sorbetTotal(sorbetCases);
    // Belt-and-suspenders: the Place Order button is disabled on the same
    // condition, so this only catches state drift.
    if (
      wantsSorbet &&
      !sorbetCasesOk({
        total,
        orderHasIceCream,
        minCases: store.sorbet_min_cases,
        freezerCases: store.sorbet_freezer_cases,
      })
    )
      return;
    // First sorbet order: the freezer question must be answered (and the
    // own-freezer disclaimer confirmed). The button is disabled on the same rule.
    const needsFreezerAnswer = wantsSorbet && sorbetGate === "ask";
    if (needsFreezerAnswer && (!freezerAnswer || (freezerAnswer === "own" && !ownFreezerConfirmed))) return;
    setStep("submitting");
    // Sorbet is open to every store (Oct 2026). Where it is kept is handled by
    // the freezer question above and the DB gate, not by enrolment.
    const sorbetOk = wantsSorbet;
    // Only flavours actually asked for; a zero line is noise for the depot.
    const sorbetLines = sorbetOk
      ? SORBET_FLAVOURS.filter((f) => (sorbetCases[f] || 0) > 0).map((f) => ({
          flavour: f,
          cases: sorbetCases[f],
        }))
      : null;
    const result = await submitOrder({
      store_id: store.id,
      stock_level: sorbetOnly ? null : stockLevel,
      notes: notes.trim() || null,
      submitted_by_name: contactName.trim(),
      submitted_by_phone: contactPhone.trim() || null,
      submitted_by_email: contactEmail.trim() || null,
      raw_form_payload: {
        public_code: store.public_code,
        submitted_store_name: store.name,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      },
      includes_sorbet: sorbetOk,
      // Sorbet is described by per-flavour cases now, not a fullness level.
      // Historical rows keep their stock level; new ones always send null.
      sorbet_stock_level: null,
      sorbet_lines: sorbetLines,
      sorbet_freezer_answer: sorbetOk && needsFreezerAnswer ? freezerAnswer : null,
    });
    if (result.success) {
      setStep("done");
    } else if (result.duplicate) {
      // The DB trigger rejected a second open order (e.g. one was created on
      // another device between resolving the store and submitting). Show the
      // same friendly duplicate view rather than a raw error.
      setStep("duplicate_order");
    } else if (String(result.error || "").includes("pad_required")) {
      // The DB trigger rejected the order because the cutover passed while the
      // page was open. Show the same block screen rather than a raw error.
      setPadStatus("blocked");
      setStep("pad_blocked");
    } else {
      setErrorMsg(result.error || "Submission failed. Please try again.");
      setStep("error");
    }
  }

  // "Is this your store?" → No. Clears the wrongly-resolved store and any
  // contact details pre-filled from it, then sends the customer back to the
  // code/email lookup. Without this, a customer who lands on the wrong store
  // (e.g. by typing the example code) has no way to correct it and may submit
  // an order against a store that isn't theirs.
  function handleNotMyStore() {
    setStore(null);
    setContactName("");
    setContactPhone("");
    setContactEmail("");
    setCodeInput("");
    setErrorMsg("");
    setStep("lookup");
  }

  if (step === "loading") {
    return <LoadingView />;
  }

  if (step === "lookup") {
    return (
      <LookupView
        codeInput={codeInput}
        setCodeInput={setCodeInput}
        onSubmit={handleManualLookup}
        onSwitchToEmail={() => {
          setEmailInput("");
          setEmailLookupError("");
          setStep("email_lookup");
        }}
        errorMsg={errorMsg}
      />
    );
  }

  if (step === "email_lookup") {
    return (
      <div className="max-w-md mx-auto px-4">
        <Brand />
        <EmailLookupView
          emailInput={emailInput}
          setEmailInput={setEmailInput}
          onSubmit={handleEmailLookup}
          onBack={() => {
            setEmailLookupError("");
            setStep("lookup");
          }}
          errorMsg={emailLookupError}
        />
        <Footer />
      </div>
    );
  }

  if (step === "email_picker") {
    return (
      <div className="max-w-md mx-auto px-4">
        <Brand />
        <EmailPickerView
          matches={emailMatches}
          onPick={handlePickFromMatches}
          onBack={() => setStep("email_lookup")}
        />
        <Footer />
      </div>
    );
  }

  if (step === "not_a_customer") {
    return (
      <div className="max-w-md mx-auto px-4">
        <Brand />
        <NotACustomerView onBack={() => setStep("email_lookup")} />
        <Footer />
      </div>
    );
  }

  if (step === "duplicate_order") {
    return <DuplicateOrderView store={store!} />;
  }

  if (step === "pad_blocked") {
    return <PadBlockedView store={store!} onNotMyStore={handleNotMyStore} />;
  }

  if (step === "confirm") {
    return (
      <ConfirmView
        store={store!}
        padStatus={padStatus}
        contactName={contactName}
        contactPhone={contactPhone}
        contactEmail={contactEmail}
        setContactName={setContactName}
        setContactPhone={setContactPhone}
        setContactEmail={setContactEmail}
        onNext={() => setStep("stock")}
        onNotMyStore={handleNotMyStore}
      />
    );
  }

  if (step === "stock") {
    return (
      <StockView
        stockLevel={stockLevel}
        setStockLevel={setStockLevel}
        sorbetEnrolled={!!store!.sorbet_enrolled}
        sorbetOnly={!!store!.sorbet_only}
        storeCode={store!.public_code}
        includesSorbet={includesSorbet}
        setIncludesSorbet={(v) => {
          setIncludesSorbet(v);
          // When toggling No, clear the case counts so a stale quantity can't
          // sneak through if the user toggles Yes again later.
          if (!v) setSorbetCases({});
        }}
        sorbetCases={sorbetCases}
        setSorbetCases={setSorbetCases}
        minCases={store!.sorbet_min_cases}
        freezerCases={store!.sorbet_freezer_cases}
        notes={notes}
        setNotes={setNotes}
        onBack={() => setStep("confirm")}
        onSubmit={handleSubmit}
        onSorbetEnrolled={() => setStore((s) => (s ? { ...s, sorbet_enrolled: true } : s))}
        askFreezer={sorbetGate === "ask"}
        freezerAnswer={freezerAnswer}
        setFreezerAnswer={setFreezerAnswer}
        ownFreezerConfirmed={ownFreezerConfirmed}
        setOwnFreezerConfirmed={setOwnFreezerConfirmed}
      />
    );
  }

  if (step === "submitting") {
    return <LoadingView label="Sending order / Envoi en cours\u2026" />;
  }

  if (step === "done") {
    return <DoneView store={store!} />;
  }

  if (step === "error") {
    return (
      <ErrorView
        errorMsg={errorMsg}
        onRetry={() => setStep("stock")}
      />
    );
  }

  return null;
}

function Brand() {
  return (
    <div className="flex flex-col items-center pt-8 pb-4">
      <div className="text-3xl font-black tracking-tight" style={{ color: "#E85E9B" }}>
        Mini Melts
      </div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">
        Canada &mdash; Order form / Formulaire de commande
      </div>
    </div>
  );
}

function LoadingView({ label = "Loading / Chargement\u2026" }: { label?: string }) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="flex flex-col items-center py-16 text-gray-500">
        <div className="w-10 h-10 border-4 border-gray-200 border-t-brand-pink rounded-full animate-spin mb-4" />
        <div className="text-sm">{label}</div>
      </div>
    </div>
  );
}

type LookupViewProps = {
  codeInput: string;
  setCodeInput: (v: string) => void;
  onSubmit: () => void;
  onSwitchToEmail: () => void;
  errorMsg: string;
};

function LookupView(props: LookupViewProps) {
  const { codeInput, setCodeInput, onSubmit, onSwitchToEmail, errorMsg } = props;
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />

      {/* Launch banner — TODO: remove or simplify after ~2026-07-15 once
          existing customers are familiar with the new ordering site. */}
      <div className="bg-gradient-to-br from-pink-50 to-teal-50 border border-pink-100 rounded-xl p-4 mt-4 text-center">
        <div className="text-sm font-bold text-gray-900 mb-1">
          {"\u{1F389}"} Welcome to the new Mini Melts Canada ordering site!
        </div>
        <div className="text-xs text-gray-600">
          Bienvenue sur le nouveau site de commande Mini Melts Canada&nbsp;!
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Enter your store code
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          Entrez le code de votre magasin
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Your code looks like <span className="font-mono font-bold">ST-XXXX</span>. If you don&apos;t know it, use the link below to look it up by email. <br />
          <span className="text-gray-500">Votre code ressemble &agrave; <span className="font-mono font-bold">ST-XXXX</span>. Si vous ne le connaissez pas, retrouvez-le par courriel ci-dessous.</span>
        </p>
        <input
          type="text"
          placeholder="ST-XXXX"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          autoFocus
          className="w-full text-2xl font-mono font-bold text-center tracking-wider uppercase border-2 border-gray-200 rounded-xl py-4 focus:outline-none focus:border-brand-pink transition"
        />
        {errorMsg && (
          <div className="mt-3 text-sm text-red-600 text-center">{errorMsg}</div>
        )}
        <button
          onClick={onSubmit}
          disabled={!codeInput.trim()}
          className="w-full mt-6 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Continue / Continuer &rarr;
        </button>
        <div className="mt-5 pt-5 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={onSwitchToEmail}
            className="text-sm font-semibold text-brand-tealDark hover:underline"
          >
            Don&apos;t have your store code? Look it up by email &rarr;
          </button>
          <div className="text-xs text-gray-500 mt-1">
            Vous n&apos;avez pas votre code? Recherchez par courriel
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// October 1 pre-authorized debit changeover notice.
//
// Shown only when get_store_pad_status returns 'required' — a store still on COD
// with no active mandate. Deliberately worded as a company-wide change ("all
// customers") rather than something aimed at this store, and it always offers
// the office as an alternative, because some customers genuinely cannot use PAD.
//
// The order still goes through. This is the warning phase; blocking, if it
// happens, comes after October 1.
function PadNotice({ storeCode }: { storeCode: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSend() {
    setState("sending");
    const r = await requestPadLink(storeCode);
    if (r.ok) {
      setSentTo(r.sentTo ?? null);
      setState("sent");
    } else {
      setState("failed");
    }
  }

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-2xl p-5 mt-4">
      <div className="font-bold text-amber-900 mb-2">
        Coming October 1: pre-authorized debit
      </div>
      <p className="text-sm text-amber-900 leading-relaxed">
        As of <strong>October 1, 2026</strong>, Mini Melts is moving all customers to
        pre-authorized debit. Your invoices will be debited automatically — nothing
        to pay at the door.
      </p>
      <p className="text-sm text-amber-900 leading-relaxed mt-2">
        If for any reason you are not able to sign up for pre-authorized debit,
        please contact our office at{" "}
        <a href="tel:4035371045" className="underline font-semibold">403-537-1045</a>{" "}
        or{" "}
        <a href="mailto:billing@minimelts.ca" className="underline font-semibold">
          billing@minimelts.ca
        </a>{" "}
        to arrange an alternative.
      </p>

      {state === "sent" ? (
        <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
          {sentTo ? (
            <>
              Sent. Check <strong>{sentTo}</strong> for your signing link. It may take a
              minute to arrive.
            </>
          ) : (
            <>
              If your account is set up for online signing, the link is on its way to the
              email on your account. If nothing arrives within a few minutes, please call
              403-537-1045.
            </>
          )}
        </p>
      ) : (
        <>
          <button
            type="button"
            onClick={handleSend}
            disabled={state === "sending"}
            className="mt-4 w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white font-semibold rounded-xl py-3"
          >
            {state === "sending" ? "Sending\u2026" : "Email me the sign-up link"}
          </button>
          {state === "failed" && (
            <p className="text-sm text-red-700 mt-2">
              Could not send just now. Please call the office at 403-537-1045.
            </p>
          )}
        </>
      )}

      <p className="text-xs text-amber-800 mt-3">
        Le 1<sup>er</sup> octobre 2026, Mini Melts passe au d&eacute;bit pr&eacute;autoris&eacute; pour
        l&apos;ensemble de sa client&egrave;le. Si vous ne pouvez pas y adh&eacute;rer, communiquez avec
        notre bureau au 403-537-1045.
      </p>

      <p className="text-xs text-amber-700 mt-3">
        You can still place this order as usual.
      </p>
    </div>
  );
}

// Shown after the October 1 cutover to a store still on COD with no active
// mandate. Online ordering stops here; the DB trigger enforces the same rule.
// Phone orders are not blocked, so the office line is always offered.
function PadBlockedView({
  store,
  onNotMyStore,
}: {
  store: StorePublicInfo;
  onNotMyStore: () => void;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSend() {
    setState("sending");
    const r = await requestPadLink(store.public_code);
    if (r.ok) {
      setSentTo(r.sentTo ?? null);
      setState("sent");
    } else {
      setState("failed");
    }
  }

  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <div className="bg-gradient-to-br from-pink-50 to-teal-50 border border-gray-100 rounded-xl p-4 mb-5">
          <div className="text-xs text-gray-500 font-mono font-bold mb-1">{store.public_code}</div>
          <div className="font-bold text-gray-900 text-lg leading-tight">{store.name}</div>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-3">
          Sign your pre-authorized debit agreement to order
        </h1>
        <p className="text-sm text-gray-700 leading-relaxed">
          As of <strong>October 1, 2026</strong>, all Mini Melts customers pay by
          pre-authorized debit. We don&apos;t have a signed agreement for this store yet, so
          online ordering is paused until it&apos;s in place. Signing takes about two minutes.
        </p>

        {state === "sent" ? (
          <p className="text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
            {sentTo ? (
              <>
                Sent. Check <strong>{sentTo}</strong> for your signing link. Once you&apos;ve
                signed, come back to this page to place your order.
              </>
            ) : (
              <>
                If your account is set up for online signing, the link is on its way to the
                email on your account. If nothing arrives within a few minutes, please call
                403-537-1045.
              </>
            )}
          </p>
        ) : (
          <>
            <button
              type="button"
              onClick={handleSend}
              disabled={state === "sending"}
              className="w-full mt-5 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-60 transition"
            >
              {state === "sending" ? "Sending\u2026" : "Email me the sign-up link"}
            </button>
            {state === "failed" && (
              <p className="text-sm text-red-700 mt-2">
                Could not send just now. Please call the office at 403-537-1045.
              </p>
            )}
          </>
        )}

        <p className="text-sm text-gray-700 leading-relaxed mt-5">
          Can&apos;t use pre-authorized debit, or need an order right away? Call{" "}
          <a href="tel:4035371045" className="underline font-semibold">403-537-1045</a> or email{" "}
          <a href="mailto:billing@minimelts.ca" className="underline font-semibold">
            billing@minimelts.ca
          </a>
          .
        </p>

        <p className="text-xs text-gray-500 leading-relaxed mt-4 pt-4 border-t border-gray-100">
          Depuis le 1<sup>er</sup> octobre 2026, tous les clients de Mini Melts paient par
          d&eacute;bit pr&eacute;autoris&eacute;. Nous n&apos;avons pas encore d&apos;entente
          sign&eacute;e pour ce magasin; les commandes en ligne sont donc suspendues jusqu&apos;&agrave;
          sa signature. Utilisez le bouton ci-dessus pour recevoir le lien, ou communiquez avec
          notre bureau au 403-537-1045 ou &agrave; billing@minimelts.ca.
        </p>

        <button
          type="button"
          onClick={onNotMyStore}
          className="w-full mt-5 text-sm font-semibold text-gray-500 hover:text-gray-700 hover:underline"
        >
          No, this isn&apos;t my store / Ce n&apos;est pas mon magasin
        </button>
      </div>
      <Footer />
    </div>
  );
}

type ConfirmViewProps = {
  store: StorePublicInfo;
  padStatus: PadGate;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  setContactName: (v: string) => void;
  setContactPhone: (v: string) => void;
  setContactEmail: (v: string) => void;
  onNext: () => void;
  onNotMyStore: () => void;
};

function ConfirmView(props: ConfirmViewProps) {
  const {
    store,
    padStatus,
    contactName,
    contactPhone,
    contactEmail,
    setContactName,
    setContactPhone,
    setContactEmail,
    onNext,
    onNotMyStore,
  } = props;
  const cityProv = [store.ship_city, store.province].filter(Boolean).join(", ");
  const canContinue = contactName.trim().length > 0 && (contactPhone.trim() !== "" || contactEmail.trim() !== "");
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      {padStatus === "required" && <PadNotice storeCode={store.public_code} />}
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
          Step 1 of 2 / &Eacute;tape 1 de 2
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-4">
          Is this your store? / Est-ce votre magasin?
        </h1>

        <div className="bg-gradient-to-br from-pink-50 to-teal-50 border border-gray-100 rounded-xl p-4 mb-5">
          <div className="text-xs text-gray-500 font-mono font-bold mb-1">
            {store.public_code}
          </div>
          <div className="font-bold text-gray-900 text-lg leading-tight">
            {store.name}
          </div>
          {store.ship_addr1 && (
            <div className="text-sm text-gray-600 mt-1">{store.ship_addr1}</div>
          )}
          {cityProv && (
            <div className="text-sm text-gray-600">{cityProv}</div>
          )}
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Your name / Votre nom <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:border-brand-teal transition"
              placeholder="First and last name"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Phone / T&eacute;l&eacute;phone
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:border-brand-teal transition"
              placeholder="(555) 123-4567"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Email / Courriel
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:border-brand-teal transition"
              placeholder="you@example.com"
            />
          </div>
          <p className="text-xs text-gray-500">
            Phone or email &mdash; at least one is required so we can reach you. <br />
            T&eacute;l&eacute;phone ou courriel &mdash; au moins un est requis.
          </p>
        </div>

        <button
          onClick={onNext}
          disabled={!canContinue}
          className="w-full mt-6 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Continue / Continuer &rarr;
        </button>
        <button
          type="button"
          onClick={onNotMyStore}
          className="w-full mt-3 text-sm font-semibold text-gray-500 hover:text-gray-700 hover:underline"
        >
          No, this isn&apos;t my store / Ce n&apos;est pas mon magasin
        </button>
      </div>
      <Footer />
    </div>
  );
}

type StockViewProps = {
  stockLevel: StockLevel | null;
  setStockLevel: (s: StockLevel) => void;
  sorbetEnrolled: boolean;
  sorbetOnly: boolean;
  storeCode: string;
  includesSorbet: boolean;
  setIncludesSorbet: (v: boolean) => void;
  sorbetCases: Record<string, number>;
  setSorbetCases: (c: Record<string, number>) => void;
  minCases: number | null;
  freezerCases: number | null;
  notes: string;
  setNotes: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  onSorbetEnrolled: () => void;
  askFreezer: boolean;
  freezerAnswer: SorbetFreezerAnswer | null;
  setFreezerAnswer: (a: SorbetFreezerAnswer) => void;
  ownFreezerConfirmed: boolean;
  setOwnFreezerConfirmed: (v: boolean) => void;
};

function StockView(props: StockViewProps) {
  const {
    stockLevel, setStockLevel,
    sorbetOnly,
    includesSorbet, setIncludesSorbet,
    sorbetCases, setSorbetCases,
    minCases, freezerCases,
    notes, setNotes,
    onBack, onSubmit,
    askFreezer, freezerAnswer, setFreezerAnswer,
    ownFreezerConfirmed, setOwnFreezerConfirmed,
  } = props;

  // Sorbet-only stores place an order with no ice cream on it.
  const orderHasIceCream = !sorbetOnly;
  const wantsSorbet = sorbetOnly || includesSorbet;
  const totalCases = sorbetTotal(sorbetCases);
  const sorbetValid = sorbetCasesOk({
    total: totalCases,
    orderHasIceCream,
    minCases,
    freezerCases,
  });
  // Normal stores: ice cream stock required, plus valid sorbet cases if added.
  // Sorbet-only stores: only the sorbet cases matter.
  // First sorbet order: the freezer question must be answered too.
  const freezerOk = !(wantsSorbet && askFreezer)
    || (!!freezerAnswer && (freezerAnswer !== "own" || ownFreezerConfirmed));
  const canSubmit = (orderHasIceCream
    ? !!stockLevel && (!includesSorbet || sorbetValid)
    : sorbetValid) && freezerOk;
  const freezerQuestion = (wantsSorbet && askFreezer) ? (
    <SorbetFreezerQuestion
      answer={freezerAnswer}
      setAnswer={setFreezerAnswer}
      ownConfirmed={ownFreezerConfirmed}
      setOwnConfirmed={setOwnFreezerConfirmed}
    />
  ) : null;

  const setCases = (flavour: string, n: number) =>
    setSorbetCases({ ...sorbetCases, [flavour]: Math.max(0, n) });


  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
          Step 2 of 2 / &Eacute;tape 2 de 2
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          {sorbetOnly
            ? "How many cases of sorbet do you need?"
            : "How full is your ice cream freezer?"}
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          {sorbetOnly
            ? "Combien de caisses de sorbet vous faut-il?"
            : "Quel est le niveau de votre cong\u00E9lateur de cr\u00E8me glac\u00E9e?"}
        </div>
        {/* 180 cups is the ICE CREAM reorder minimum and never applied to
            sorbet, which is ordered in cases. It used to render on both
            screens. */}
        {!sorbetOnly && (
          <p className="text-xs text-gray-500 mb-5">
            Minimum order: 180 cups / Commande minimum : 180 unit&eacute;s
          </p>
        )}

        {/* Ice cream stock: hidden for sorbet-only stores (they sell no ice cream). */}
        {!sorbetOnly && (
          <div className="grid grid-cols-2 gap-3 mb-5">
            {STOCK_OPTIONS.map((opt) => {
              const selected = stockLevel === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setStockLevel(opt.value)}
                  className={
                    "rounded-xl p-4 border-2 transition text-left " +
                    (selected
                      ? "border-brand-pink bg-pink-50"
                      : "border-gray-200 bg-white hover:border-gray-300")
                  }
                >
                  <div className="text-3xl mb-2">{opt.icon}</div>
                  <div className="font-semibold text-gray-900 text-sm">{opt.en}</div>
                  <div className="text-xs text-gray-500">{opt.fr}</div>
                </button>
              );
            })}
          </div>
        )}

        {/* Sorbet-only: per-flavour cases, no ice cream, no application. */}
        {sorbetOnly && freezerQuestion}
        {sorbetOnly && (
          <SorbetCasePicker
            sorbetCases={sorbetCases}
            setCases={setCases}
            totalCases={totalCases}
            minCases={orderHasIceCream ? null : minCases}
            freezerCases={freezerCases}
          />
        )}

        {/* Sorbet toggle + application: only for NORMAL stores. Sorbet-only
            stores already have their sorbet stock selector above and are
            already contracted, so none of this applies to them. */}
        {/* Sorbet is open to every store (Oct 2026). A store's first sorbet
            order also asks where the sorbet will be kept. */}
        {!sorbetOnly && (
          <>
            <div className="border-t border-gray-200 pt-5 mb-5">
              <h2 className="text-base font-bold text-gray-900 mb-1">
                {"\u{1F368}"} Are you also ordering Mini Melts BIG Sorbet?
              </h2>
              <div className="text-sm text-gray-500 mb-3">
                Commandez-vous aussi du sorbet Mini Melts BIG?
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIncludesSorbet(false)}
                  className={
                    "rounded-xl p-3 border-2 transition text-center font-semibold " +
                    (!includesSorbet
                      ? "border-brand-pink bg-pink-50 text-gray-900"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")
                  }
                >
                  No / Non
                </button>
                <button
                  onClick={() => setIncludesSorbet(true)}
                  className={
                    "rounded-xl p-3 border-2 transition text-center font-semibold " +
                    (includesSorbet
                      ? "border-brand-pink bg-pink-50 text-gray-900"
                      : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")
                  }
                >
                  Yes / Oui
                </button>
              </div>
            </div>

            {includesSorbet && freezerQuestion}
            {includesSorbet && (
              <div className="mb-5">
                <h2 className="text-base font-bold text-gray-900 mb-1">
                  How many cases of each flavour?
                </h2>
                <div className="text-sm text-gray-500 mb-3">
                  Combien de caisses de chaque saveur?
                </div>
                <SorbetCasePicker
                  sorbetCases={sorbetCases}
                  setCases={setCases}
                  totalCases={totalCases}
                  /* Exempt: the driver is already coming for the ice cream. */
                  minCases={null}
                  freezerCases={freezerCases}
                />
              </div>
            )}
          </>
        )}

        <div className="mb-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Notes <span className="text-gray-400 font-normal">(optional / facultatif)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:border-brand-teal transition resize-none"
            /* Cotton candy is an ice cream flavour — a sorbet-only store never
               sees it, so the example would just confuse them. */
            placeholder={
              sorbetOnly
                ? "e.g., Delivery before noon / Livraison avant midi"
                : "e.g., Out of cotton candy / Plus de barbe a papa"
            }
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onBack}
            className="flex-none bg-gray-100 text-gray-700 font-semibold px-5 py-4 rounded-xl hover:bg-gray-200 transition"
          >
            &larr; Back
          </button>
          <button
            onClick={onSubmit}
            disabled={!canSubmit}
            className="flex-1 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Place order / Commander &rarr;
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}

type SorbetCasePickerProps = {
  sorbetCases: Record<string, number>;
  setCases: (flavour: string, n: number) => void;
  totalCases: number;
  // null when no floor applies to this order (ice cream is on it too).
  minCases: number | null;
  freezerCases: number | null;
};

// Per-flavour case steppers. Sorbet ships as whole 24-pouch cases, so the store
// states quantities outright rather than describing freezer fullness.
// First-ever sorbet order: where will the sorbet be kept? Bilingual, with the
// freezer-temperature disclaimer, and an explicit confirmation for stores using
// their own freezer. The answer is stored on the order and the store; the DB
// trigger flags "needs a sorbet freezer" orders as new freezer installs.
const FREEZER_OPTIONS: { value: SorbetFreezerAnswer; en: string; fr: string }[] = [
  { value: "ours", en: "I already have a Mini Melts sorbet freezer", fr: "J\u2019ai d\u00E9j\u00E0 un cong\u00E9lateur \u00E0 sorbet Mini Melts" },
  { value: "needs_ours", en: "I need a sorbet freezer", fr: "J\u2019ai besoin d\u2019un cong\u00E9lateur \u00E0 sorbet" },
  { value: "own", en: "I will sell sorbet in my own freezer (\u221218\u00B0C)", fr: "Je vendrai le sorbet dans mon propre cong\u00E9lateur (\u221218\u00A0\u00B0C)" },
];

function SorbetFreezerQuestion(props: {
  answer: SorbetFreezerAnswer | null;
  setAnswer: (a: SorbetFreezerAnswer) => void;
  ownConfirmed: boolean;
  setOwnConfirmed: (v: boolean) => void;
}) {
  const { answer, setAnswer, ownConfirmed, setOwnConfirmed } = props;
  return (
    <div className="mb-5 rounded-xl border-2 border-pink-200 bg-pink-50/60 p-4">
      <h2 className="text-base font-bold text-gray-900 mb-1">
        {"\u{1F368}"} Where will you keep your sorbet?
      </h2>
      <div className="text-sm text-gray-500 mb-3">O&ugrave; conserverez-vous votre sorbet?</div>
      <div className="rounded-lg border border-red-300 bg-red-50 p-3 mb-3">
        <p className="text-sm font-bold text-red-700">
          {"\u26A0\uFE0F"} Sorbet cannot be sold in the Mini Melts ice cream freezer &mdash; the temperature is too cold.
        </p>
        <p className="text-xs text-red-600 mt-1">
          Le sorbet ne peut pas &ecirc;tre vendu dans le cong&eacute;lateur &agrave; cr&egrave;me glac&eacute;e Mini Melts &mdash; la temp&eacute;rature est trop froide.
        </p>
      </div>
      <div className="space-y-2">
        {FREEZER_OPTIONS.map((opt) => {
          const selected = answer === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setAnswer(opt.value)}
              className={
                "w-full text-left rounded-xl p-3 border-2 transition " +
                (selected ? "border-brand-pink bg-white" : "border-gray-200 bg-white hover:border-gray-300")
              }
            >
              <span className={"inline-block w-4 h-4 rounded-full border-2 mr-2 align-middle " + (selected ? "border-brand-pink bg-brand-pink" : "border-gray-300")} />
              <span className="font-semibold text-gray-900 text-sm align-middle">{opt.en}</span>
              <div className="text-xs text-gray-500 ml-6">{opt.fr}</div>
            </button>
          );
        })}
      </div>
      {answer === "needs_ours" && (
        <p className="text-xs text-gray-600 mt-3">
          We&apos;ll bring a sorbet freezer with your first sorbet delivery. / Nous apporterons un cong&eacute;lateur &agrave; sorbet avec votre premi&egrave;re livraison de sorbet.
        </p>
      )}
      {answer === "own" && (
        <label className="flex items-start gap-2 mt-3 text-sm text-gray-800 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1"
            checked={ownConfirmed}
            onChange={(e) => setOwnConfirmed(e.target.checked)}
          />
          <span>
            I confirm my freezer holds &minus;18&deg;C and is <strong>not</strong> the Mini Melts ice cream freezer.
            <span className="block text-xs text-gray-500">
              Je confirme que mon cong&eacute;lateur maintient &minus;18&nbsp;&deg;C et n&apos;est <strong>pas</strong> le cong&eacute;lateur &agrave; cr&egrave;me glac&eacute;e Mini Melts.
            </span>
          </span>
        </label>
      )}
    </div>
  );
}

function SorbetCasePicker(props: SorbetCasePickerProps) {
  const { sorbetCases, setCases, totalCases, minCases, freezerCases } = props;
  const belowMin = !!minCases && totalCases > 0 && totalCases < minCases;
  const overCap = !!freezerCases && totalCases > freezerCases;

  return (
    <div className="mb-5">
      <div className="rounded-xl border-2 border-gray-200 divide-y divide-gray-100">
        {SORBET_FLAVOURS.map((flavour) => {
          const n = sorbetCases[flavour] || 0;
          return (
            <div key={flavour} className="flex items-center justify-between p-3">
              <div>
                <div className="font-semibold text-gray-900 text-sm">{flavour}</div>
                <div className="text-xs text-gray-500">
                  {n > 0 ? `${n * 24} pouches / unit\u00E9s` : "24 per case / par caisse"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove a case of ${flavour}`}
                  onClick={() => setCases(flavour, n - 1)}
                  disabled={n <= 0}
                  className="w-10 h-10 rounded-lg border-2 border-gray-200 text-lg font-bold text-gray-700 disabled:opacity-30 hover:border-gray-300 transition"
                >
                  &minus;
                </button>
                <div className="w-10 text-center font-bold text-gray-900 tabular-nums">{n}</div>
                <button
                  type="button"
                  aria-label={`Add a case of ${flavour}`}
                  onClick={() => setCases(flavour, n + 1)}
                  className="w-10 h-10 rounded-lg border-2 border-brand-pink text-lg font-bold text-brand-pink hover:bg-pink-50 transition"
                >
                  +
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-baseline justify-between mt-3">
        <span className="text-sm font-semibold text-gray-700">Total / Total</span>
        <span className="font-bold text-gray-900">
          {totalCases} {totalCases === 1 ? "case / caisse" : "cases / caisses"}
          <span className="text-gray-400 font-normal text-sm"> ({totalCases * 24})</span>
        </span>
      </div>

      {minCases ? (
        <p className={"text-xs mt-1 " + (belowMin ? "text-red-600 font-semibold" : "text-gray-500")}>
          Minimum order: {minCases} cases / Commande minimum : {minCases} caisses
        </p>
      ) : null}
      {overCap && freezerCases ? (
        <p className="text-xs mt-1 text-red-600 font-semibold">
          Your freezer holds {freezerCases} cases. / Votre cong&eacute;lateur contient {freezerCases} caisses.
        </p>
      ) : null}
    </div>
  );
}

type DoneViewProps = {
  store: StorePublicInfo;
};

function DoneView(props: DoneViewProps) {
  const { store } = props;
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
        <div className="text-6xl mb-3">{"\u2705"}</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Order received!
        </h1>
        <div className="text-base text-gray-500 mb-5">
          Commande re&ccedil;ue!
        </div>
        <p className="text-gray-700 mb-4">
          Thanks <span className="font-semibold">{store.name}</span> &mdash; your reorder request has been sent to your local depot. You&rsquo;ll get an email confirming your delivery date once the depot has it scheduled.
        </p>
        <p className="text-sm text-gray-500 mb-2">
          Merci &mdash; votre demande a &eacute;t&eacute; envoy&eacute;e &agrave; votre d&eacute;p&ocirc;t local. Vous recevrez un courriel confirmant la date de livraison une fois la commande planifi&eacute;e par le d&eacute;p&ocirc;t.
        </p>
      </div>
      <Footer />
    </div>
  );
}

type DuplicateOrderViewProps = {
  store: StorePublicInfo;
};

function DuplicateOrderView(props: DuplicateOrderViewProps) {
  const { store } = props;
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
        <div className="text-5xl mb-3">{"\u{1F4CB}"}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          You already have an order in progress
        </h1>
        <div className="text-sm text-gray-500 mb-5">
          Vous avez d&eacute;j&agrave; une commande en cours
        </div>
        <div className="bg-gradient-to-br from-pink-50 to-teal-50 border border-gray-100 rounded-xl p-4 mb-5 text-left">
          <div className="text-xs text-gray-500 font-mono font-bold mb-1">
            {store.public_code}
          </div>
          <div className="font-bold text-gray-900 leading-tight">{store.name}</div>
        </div>
        <p className="text-gray-700 mb-3">
          We have an order for your store that&apos;s still being processed. If you need
          to change it or add to it, please contact us at{" "}
          <a href="mailto:info@minimelts.ca" className="font-semibold text-brand-tealDark hover:underline">info@minimelts.ca</a>.
        </p>
        <p className="text-sm text-gray-500">
          Nous avons une commande en cours de traitement pour votre magasin. Pour la
          modifier ou y ajouter, &eacute;crivez-nous &agrave;{" "}
          <a href="mailto:info@minimelts.ca" className="font-semibold text-brand-tealDark hover:underline">info@minimelts.ca</a>.
        </p>
      </div>
      <Footer />
    </div>
  );
}

type ErrorViewProps = {
  errorMsg: string;
  onRetry: () => void;
};

function ErrorView(props: ErrorViewProps) {
  const { errorMsg, onRetry } = props;
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
        <div className="text-5xl mb-3">{"\u26A0\uFE0F"}</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-red-600 mb-6">{errorMsg}</p>
        <button
          onClick={onRetry}
          className="w-full bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 transition"
        >
          Try again / R&eacute;essayer
        </button>
      </div>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <div className="text-center text-xs text-gray-400 py-6">
      minimelts.ca &middot; Need help? Call your depot.
    </div>
  );
}

export default function OrderForm() {
  return (
    <Suspense fallback={<LoadingView />}>
      <OrderFormInner />
    </Suspense>
  );
}
