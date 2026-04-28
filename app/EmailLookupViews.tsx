"use client";

import { StoreLookupResult } from "@/lib/supabase";

type EmailLookupViewProps = {
  emailInput: string;
  setEmailInput: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
  errorMsg: string;
};

export function EmailLookupView(props: EmailLookupViewProps) {
  const { emailInput, setEmailInput, onSubmit, onBack, errorMsg } = props;
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Look up your store</h1>
      <div className="text-sm text-gray-500 mb-4">Recherchez votre magasin</div>
      <p className="text-sm text-gray-600 mb-6">
        Enter the email address we have on file. <br />
        <span className="text-gray-500">Entrez l&apos;adresse courriel enregistr&eacute;e.</span>
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
          &larr; Back
        </button>
        <button
          onClick={onSubmit}
          disabled={!emailInput.trim()}
          className="flex-1 bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Look up / Rechercher &rarr;
        </button>
      </div>
    </div>
  );
}

type EmailPickerViewProps = {
  matches: StoreLookupResult[];
  onPick: (match: StoreLookupResult) => void;
  onBack: () => void;
};

export function EmailPickerView(props: EmailPickerViewProps) {
  const { matches, onPick, onBack } = props;
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
      <h1 className="text-xl font-bold text-gray-900 mb-1">
        We found {matches.length} stores
      </h1>
      <div className="text-sm text-gray-500 mb-4">
        {matches.length} magasins trouv&eacute;s
      </div>
      <p className="text-sm text-gray-600 mb-5">
        Pick the store you want to order for. <br />
        <span className="text-gray-500">Choisissez le magasin pour commander.</span>
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
        &larr; Back / Retour
      </button>
    </div>
  );
}

type NotACustomerViewProps = {
  onBack: () => void;
};

export function NotACustomerView(props: NotACustomerViewProps) {
  const { onBack } = props;
  return (
    <div className="bg-white rounded-2xl shadow-sm p-6 mt-4 text-center">
      <div className="text-5xl mb-4">&#x1F91D;</div>
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
        Si vous n&apos;&ecirc;tes pas encore client Mini Melts, visitez notre site web pour en savoir plus.
      </p>
      <a
        href="https://minimelts.ca"
        className="block w-full bg-brand-pink text-white font-semibold py-4 rounded-xl hover:opacity-90 active:opacity-80 transition"
      >
        Visit minimelts.ca &rarr;
      </a>
      <button
        onClick={onBack}
        className="w-full mt-3 bg-gray-100 text-gray-700 font-semibold py-3 rounded-xl hover:bg-gray-200 transition"
      >
        &larr; Try a different email
      </button>
    </div>
  );
}
