"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  lookupStoreByCode,
  submitOrder,
  StorePublicInfo,
  StockLevel,
} from "@/lib/supabase";

type Step = "loading" | "lookup" | "confirm" | "stock" | "submitting" | "done" | "error";

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
  const [store, setStore] = useState<StorePublicInfo | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [stockLevel, setStockLevel] = useState<StockLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  // Load the store from the URL parameter on first render
  useEffect(() => {
    if (codeParam) {
      (async () => {
        const result = await lookupStoreByCode(codeParam);
        if (result) {
          setStore(result);
          // Prefill contact fields if we have them
          const name = [result.first_name, result.last_name].filter(Boolean).join(" ");
          setContactName(name);
          setContactPhone(result.phone || "");
          setContactEmail(result.email || "");
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

  async function handleManualLookup() {
    setErrorMsg("");
    const trimmed = codeInput.trim().toUpperCase();
    if (!trimmed) return;
    setStep("loading");
    const result = await lookupStoreByCode(trimmed);
    if (result) {
      setStore(result);
      const name = [result.first_name, result.last_name].filter(Boolean).join(" ");
      setContactName(name);
      setContactPhone(result.phone || "");
      setContactEmail(result.email || "");
      setStep("confirm");
    } else {
      setErrorMsg("Code not found. Please check your sticker / Code introuvable.");
      setStep("lookup");
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
        errorMsg={errorMsg}
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
  errorMsg,
}: {
  codeInput: string;
  setCodeInput: (v: string) => void;
  onSubmit: () => void;
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

function DoneView({ store }: { store: StorePublicInfo }) {
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />
      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
        <div className="text-6xl mb-3">✅</div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          Order received!
        </h1>
        <div className="text-base text-gray-500 mb-5">
          Commande reçue!
        </div>
        <p className="text-gray-700 mb-4">
          Thanks <span className="font-semibold">{store.name}</span> — your reorder request has been sent to your local depot. Your driver will contact you to schedule.
        </p>
        <p className="text-sm text-gray-500 mb-2">
          Merci — votre demande a été envoyée à votre dépôt local. Votre chauffeur vous contactera.
        </p>
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
