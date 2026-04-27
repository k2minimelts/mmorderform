"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  lookupStoreByCode,
  lookupStoresByEmail,
  submitOrder,
  StorePublicInfo,
  StoreLookupResult,
  StockLevel,
} from "@/lib/supabase";

type Step =
  | "loading"
  | "lookup"
  | "email_lookup"
  | "email_picker"
  | "not_a_customer"
  | "confirm"
  | "stock"
  | "submitting"
  | "done"
  | "error";

const STOCK_OPTIONS: { value: StockLevel; en: string; fr: string; icon: string }[] = [
  { value: "empty", en: "Empty", fr: "Vide", icon: "📭" },
  { value: "almost_empty", en: "Almost empty", fr: "Presque vide", icon: "📦" },
  { value: "half", en: "Half full", fr: "Moitié pleine", icon: "🗄️" },
  { value: "three_quarter", en: "3/4 full", fr: "3/4 pleine", icon: "🗃️" },
];

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
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);

  // Load the store from the URL parameter on first render
  useEffect(() => {
    if (codeParam) {
      (async () => {
        const result = await lookupStoreByCode(codeParam);
        if (result) {
          loadStoreIntoForm(result);
          setStep("confirm");
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

  // Helper: prefill contact fields from a fetched StorePublicInfo
  function loadStoreIntoForm(result: StorePublicInfo) {
    setStore(result);
    const name = [result.first_name, result.last_name].filter(Boolean).join(" ");
    setContactName(name);
    setContactPhone(result.phone || "");
    setContactEmail(result.email || "");
  }

  async function handleManualLookup() {
    setErrorMsg("");
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    setStep("loading");
    const result = await lookupStoreByCode(trimmed);
    if (result) {
      loadStoreIntoForm(result);
      setStep("confirm");
    } else {
      setErrorMsg("Code not found. Please check your sticker / Code introuvable.");
      setStep("lookup");
    }
  }

  async function handleEmailLookup() {
    setEmailLookupError("");
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    // Light client-side email format check; the SQL function does case/trim handling
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailLookupError("Please enter a valid email address. / Adresse courriel invalide.");
      return;
    }
    setStep("loading");
    const matches = await lookupStoresByEmail(trimmed);
    if (matches.length === 0) {
      setStep("not_a_customer");
      return;
    }
    if (matches.length === 1) {
      // Single match — auto-load straight into the confirm step
      const full = await lookupStoreByCode(matches[0].public_code);
      if (full) {
        loadStoreIntoForm(full);
        setStep("confirm");
      } else {
        // Extremely unlikely (would mean email-lookup found a store that
        // code-lookup can't see), but handle gracefully
        setErrorMsg("Could not load store details. Please try again.");
        setStep("error");
      }
      return;
    }
    // Multiple matches — show picker
    setEmailMatches(matches);
    setStep("email_picker");
  }

  async function handlePickFromMatches(match: StoreLookupResult) {
    setStep("loading");
    const full = await lookupStoreByCode(match.public_code);
    if (full) {
      loadStoreIntoForm(full);
      setStep("confirm");
    } else {
      setErrorMsg("Could not load store details. Please try again.");
      setStep("error");
    }
  }

  async function handleSubmit() {
    if (!store || !stockLevel) return;
    setStep("submitting");
    const result = await submitOrder({
      store_id: store.id,
      stock_level: stockLevel,
      notes: notes.trim() || null,
      submitted_by_name: contactName.trim(),
      submitted_by_phone: contactPhone.trim() || null,
      submitted_by_email: contactEmail.trim() || null,
      raw_form_payload: {
        public_code: store.public_code,
        submitted_store_name: store.name,
        user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      },
    });
    if (result.success) {
      setOrderId(result.order_id || null);
      setSubmittedAt(new Date());
      setStep("done");
    } else {
      setErrorMsg(result.error || "Submission failed. Please try again.");
      setStep("error");
    }
  }

  // ============ RENDER ============

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
    );
  }

  if (step === "email_picker") {
    return (
      <EmailPickerView
        matches={emailMatches}
        onPick={handlePickFromMatches}
        onBack={() => setStep("email_lookup")}
      />
    );
  }

  if (step === "not_a_customer") {
    return (
      <NotACustomerView
        onBack={() => setStep("email_lookup")}
      />
    );
  }

  if (step === "confirm") {
    return (
      <ConfirmView
        store={store!}
        contactName={contactName}
        contactPhone={contactPhone}
        contactEmail={contactEmail}
        setContactName={setContactName}
        setContactPhone={setContactPhone}
        setContactEmail={setContactEmail}
        onNext={() => setStep("stock")}
      />
    );
  }

  if (step === "stock") {
    return (
      <StockView
        stockLevel={stockLevel}
        setStockLevel={setStockLevel}
        notes={notes}
        setNotes={setNotes}
        onBack={() => setStep("confirm")}
        onSubmit={handleSubmit}
      />
    );
  }

  if (step === "submitting") {
    return <LoadingView label="Sending order / Envoi en cours…" />;
  }

  if (step === "done") {
    return <DoneView store={store!} orderId={orderId} submittedAt={submittedAt} />;
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

// =================================================================
// VIEWS
// =================================================================

function Brand() {
  return (
    <div className="flex flex-col items-center pt-8 pb-4">
      <div className="text-3xl font-black tracking-tight" style={{ color: "#E85E9B" }}>
        Mini Melts
      </div>
      <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mt-1">
        Canada — Order form / Formulaire de commande
      </div>
    </div>
  );
}

function LoadingView({ label = "Loading / Chargement…" }: { label?: string }) {
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

function LookupView({
  codeInput,
  setCodeInput,
  onSubmit,
  onSwitchToEmail,
  errorMsg,
}: {
  codeInput: string;
  setCodeInput: (v: string) => void;
  onSubmit: () => void;
  onSwitchToEmail: () => void;
  errorMsg: string;
}) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Enter your store code
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          Entrez le code de votre magasin
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Your code looks like <span className="font-mono font-bold">ST-1234</span> and is on the sticker on your freezer. <br />
          <span className="text-gray-500">Le code se trouve sur l&apos;autocollant du congélateur.</span>
        </p>
        <input
          type="text"
          placeholder="ST-1234"
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
          Continue / Continuer →
        </button>
        <div className="mt-5 pt-5 border-t border-gray-100 text-center">
          <button
            type="button"
            onClick={onSwitchToEmail}
            className="text-sm font-semibold text-brand-tealDark hover:underline"
          >
            Don&apos;t have your store code? Look it up by email →
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

function EmailLookupView({
  emailInput,
  setEmailInput,
  onSubmit,
  onBack,
  errorMsg,
}: {
  emailInput: string;
  setEmailInput: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  errorMsg: string;
}) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Look up your store
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          Recherchez votre magasin
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Enter the email address we have on file and we&apos;ll find your store. <br />
          <span className="text-gray-500">Entrez l&apos;adresse courriel enregistrée pour trouver votre magasin.</span>
        </p>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={emailInput}
          onChange={(e) => setEmailInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSubmit(); }}
          autoFocus
          className="w-full text-base border-2 border-gray-200 rounded-xl px-4 py-4 focus:outline-none focus:border-brand-pink transition"
        />
        {errorMsg && (
          <div className="mt-3 text-sm text-red-600 text-center">{errorMsg}</div>
        )}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onBack}
            className="flex-none bg-gray-100 text-gray-700 font-semibold px-5 py-4 rounded-xl hover:bg-gray-200 transition"
          >
            ← Back
          </button>
          <button
            onClick={onSubmit}
            disabled={!emailInput.trim()}
            className="flex-1 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Look up / Rechercher →
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function EmailPickerView({
  matches,
  onPick,
  onBack,
}: {
  matches: StoreLookupResult[];
  onPick: (match: StoreLookupResult) => void;
  onBack: () => void;
}) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          We found {matches.length} stores
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          {matches.length} magasins trouvés
        </div>
        <p className="text-sm text-gray-600 mb-5">
          Pick the store you want to place an order for. <br />
          <span className="text-gray-500">Choisissez le magasin pour lequel vous souhaitez commander.</span>
        </p>

        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {matches.map((m) => {
            const cityProv = [m.ship_city, m.province].filter(Boolean).join(", ");
            return (
              <button
                key={m.id}
                onClick={() => onPick(m)}
                className="w-full text-left border-2 border-gray-200 hover:border-brand-pink hover:bg-pink-50 rounded-xl p-3 transition"
              >
                <div className="text-xs text-gray-500 font-mono font-bold mb-0.5">
                  {m.public_code}
                </div>
                <div className="font-semibold text-gray-900 text-sm leading-tight">
                  {m.name}
                </div>
                {cityProv && (
                  <div className="text-xs text-gray-500 mt-0.5">{cityProv}</div>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={onBack}
          className="w-full mt-5 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-200 transition"
        >
          ← Back / Retour
        </button>
      </div>
      <Footer />
    </div>
  );
}

function NotACustomerView({ onBack }: { onBack: () => void }) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
        <div className="text-5xl mb-4">🤝</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          We couldn&apos;t find that email
        </h1>
        <div className="text-sm text-gray-500 mb-5">
          Adresse courriel introuvable
        </div>
        <p className="text-sm text-gray-700 mb-2 leading-relaxed">
          If you&apos;re not currently a Mini Melts customer, please visit our website to learn more.
        </p>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          Si vous n&apos;êtes pas encore client Mini Melts, visitez notre site web pour en savoir plus.
        </p>

        
          href="https://minimelts.ca"
          className="block w-full bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 transition"
        >
          Visit minimelts.ca →
        </a>

        <button
          onClick={onBack}
          className="w-full mt-3 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-200 transition"
        >
          ← Try a different email / Essayer un autre courriel
        </button>
      </div>
      <Footer />
    </div>
  );
}

function ConfirmView({
  store,
  contactName,
  contactPhone,
  contactEmail,
  setContactName,
  setContactPhone,
  setContactEmail,
  onNext,
}: {
  store: StorePublicInfo;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  setContactName: (v: string) => void;
  setContactPhone: (v: string) => void;
  setContactEmail: (v: string) => void;
  onNext: () => void;
}) {
  const cityProv = [store.ship_city, store.province].filter(Boolean).join(", ");
  const canContinue = contactName.trim().length > 0 && (contactPhone.trim() || contactEmail.trim());
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
          Step 1 of 2 / Étape 1 de 2
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
              Phone / Téléphone
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
            Phone or email — at least one is required so we can reach you. <br />
            Téléphone ou courriel — au moins un est requis.
          </p>
        </div>

        <button
          onClick={onNext}
          disabled={!canContinue}
          className="w-full mt-6 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Continue / Continuer →
        </button>
      </div>
      <Footer />
    </div>
  );
}

function StockView({
  stockLevel,
  setStockLevel,
  notes,
  setNotes,
  onBack,
  onSubmit,
}: {
  stockLevel: StockLevel | null;
  setStockLevel: (s: StockLevel) => void;
  notes: string;
  setNotes: (v: string) => void;
  onBack: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
          Step 2 of 2 / Étape 2 de 2
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          How full is your freezer?
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          Quel est le niveau de votre congélateur?
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Minimum order: 180 cups / Commande minimum : 180 unités
        </p>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {STOCK_OPTIONS.map((opt) => {
            const selected = stockLevel === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setStockLevel(opt.value)}
                className={`rounded-xl p-4 border-2 transition text-left ${
                  selected
                    ? "border-brand-pink bg-pink-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <div className="text-3xl mb-2">{opt.icon}</div>
                <div className="font-semibold text-gray-900 text-sm">
                  {opt.en}
                </div>
                <div className="text-xs text-gray-500">{opt.fr}</div>
              </button>
            );
          })}
        </div>

        <div className="mb-2">
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Notes <span className="text-gray-400 font-normal">(optional / facultatif)</span>
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-3 focus:outline-none focus:border-brand-teal transition resize-none"
            placeholder="e.g., Out of cotton candy / Plus de barbe à papa"
          />
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onBack}
            className="flex-none bg-gray-100 text-gray-700 font-semibold px-5 py-4 rounded-xl hover:bg-gray-200 transition"
          >
            ← Back
          </button>
          <button
            onClick={onSubmit}
            disabled={!stockLevel}
            className="flex-1 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            Place order / Commander →
          </button>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function DoneView({
  store,
  orderId,
  submittedAt,
}: {
  store: StorePublicInfo;
  orderId: string | null;
  submittedAt: Date | null;
}) {
  // 5-second cooldown before "Order for another store" becomes clickable.
  // Prevents accidental double-submits and gives the customer time to read.
  const [cooldown, setCooldown] = useState(5);
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Order # = last 6 chars of UUID, uppercased — matches what the email shows
  const shortId = orderId
    ? orderId.replace(/-/g, "").slice(-6).toUpperCase()
    : null;

  const submittedLabel = submittedAt
    ? submittedAt.toLocaleString("en-CA", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : null;

  const canPlaceAnother = cooldown <= 0;

  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <div className="text-center mb-5">
          <div className="text-6xl mb-3">✅</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Order received!
          </h1>
          <div className="text-base text-gray-500">Commande reçue</div>
        </div>

        <div className="bg-gradient-to-br from-pink-50 to-teal-50 border border-gray-100 rounded-xl p-4 mb-5 text-sm">
          <div className="space-y-2">
            {shortId && (
              <div className="flex justify-between items-baseline">
                <span className="text-gray-500">Order #</span>
                <span className="font-mono font-bold text-gray-900 tracking-wider">
                  #{shortId}
                </span>
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-gray-500">Store</span>
              <span className="font-semibold text-gray-900 text-right ml-3">
                {store.name}
              </span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-gray-500">Code</span>
              <span className="font-mono text-gray-700">
                {store.public_code}
              </span>
            </div>
            {submittedLabel && (
              <div className="flex justify-between items-baseline">
                <span className="text-gray-500">Submitted</span>
                <span className="text-gray-700 text-right ml-3 text-xs">
                  {submittedLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            What happens next
          </div>
          <p className="text-gray-700 text-sm leading-relaxed">
            Thanks <span className="font-semibold">{store.name}</span> — our team
            will schedule your delivery and the driver should arrive within the
            next <span className="font-semibold">2 weeks</span>. For urgent
            orders we will do our best to schedule your delivery as soon as
            possible.
          </p>
        </div>

        <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 mb-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Prochaines étapes
          </div>
          <p className="text-gray-700 text-sm leading-relaxed">
            Merci — notre équipe planifiera votre livraison et le chauffeur
            devrait arriver dans les <span className="font-semibold">2 prochaines semaines</span>.
            Pour les commandes urgentes, nous ferons de notre mieux pour
            planifier votre livraison dès que possible.
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-800 mb-5">
          <strong>📧 Confirmation email sent.</strong>{" "}
          <span className="text-blue-600">Check your inbox / Vérifiez votre boîte de réception.</span>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              window.location.href = "/";
            }}
            disabled={!canPlaceAnother}
            className="w-full bg-brand-pink text-white font-semibold py-3.5 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {canPlaceAnother
              ? "Order for another store / Commander pour un autre magasin"
              : `Wait ${cooldown}s… / Attendez ${cooldown}s…`}
          </button>
          
            href="https://minimelts.ca"
            className="block w-full bg-gray-100 text-gray-700 font-semibold py-3.5 rounded-xl hover:bg-gray-200 transition text-center"
          >
            Visit minimelts.ca →
          </a>
        </div>
      </div>
      <Footer />
    </div>
  );
}

function ErrorView({ errorMsg, onRetry }: { errorMsg: string; onRetry: () => void }) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
        <div className="text-5xl mb-3">⚠️</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Something went wrong
        </h1>
        <p className="text-sm text-red-600 mb-6">{errorMsg}</p>
        <button
          onClick={onRetry}
          className="w-full bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 transition"
        >
          Try again / Réessayer
        </button>
      </div>
      <Footer />
    </div>
  );
}

function Footer() {
  return (
    <div className="text-center text-xs text-gray-400 py-6">
      minimelts.ca · Need help? Call your depot.
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