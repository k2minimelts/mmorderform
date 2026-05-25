"use client";

// app/refunds/page.tsx
//
// Bilingual (EN/FR) vending refund-request form for Mini Melts Canada.
// Iframed inside the Squarespace /refunds page. Posts to the submit-refund
// Supabase edge function. Same self-contained styling approach as the
// partner/contact form (inline <style> so it renders identically in an iframe).
//
// Language: ?lang=fr | ?lang=en (defaults en) + in-form toggle.
//   French page should iframe …/refunds?lang=fr

import { useEffect, useState } from "react";

const EDGE_FUNCTION_URL =
  "https://jheqxfkyxewofpnkbayc.supabase.co/functions/v1/submit-refund";

type Lang = "en" | "fr";

const COPY = {
  en: {
    heading: "Refund request",
    intro:
      "Had an issue with a Mini Melts machine? Fill out the form below and we'll verify your purchase and be in touch to arrange your refund.",
    name: "Name",
    email: "Email",
    phone: "Phone",
    payMethod: "How did you pay?",
    payCash: "Cash",
    payCard: "Credit or Debit",
    payChoose: "Select…",
    location: "Where was the machine? (location / venue)",
    amount: "Refund amount",
    amountHint: "e.g. $2.00",
    details: "What happened?",
    optional: "optional",
    required: "required",
    send: "Submit request",
    sending: "Submitting…",
    successTitle: "Request received",
    successBody:
      "Thanks — we've received your refund request. We'll verify your purchase and be in touch shortly to arrange your refund.",
    errName: "Please enter your name.",
    errEmail: "Please enter a valid email address.",
    errPay: "Please tell us how you paid.",
    errLocation: "Please tell us where the machine was.",
    errAmount: "Please enter the refund amount.",
    errDetails: "Please describe what happened.",
    errGeneric:
      "Something went wrong submitting your request. Please try again, or email info@minimelts.ca.",
    switchTo: "Français",
  },
  fr: {
    heading: "Demande de remboursement",
    intro:
      "Un problème avec un distributeur Mini Melts ? Remplissez le formulaire ci-dessous et nous vérifierons votre achat avant de vous contacter pour organiser votre remboursement.",
    name: "Nom",
    email: "Courriel",
    phone: "Téléphone",
    payMethod: "Comment avez-vous payé ?",
    payCash: "Comptant",
    payCard: "Crédit ou débit",
    payChoose: "Choisir…",
    location: "Où était le distributeur ? (lieu / endroit)",
    amount: "Montant du remboursement",
    amountHint: "ex. 2,00 $",
    details: "Que s'est-il passé ?",
    optional: "facultatif",
    required: "requis",
    send: "Envoyer la demande",
    sending: "Envoi…",
    successTitle: "Demande reçue",
    successBody:
      "Merci — nous avons bien reçu votre demande de remboursement. Nous vérifierons votre achat et vous contacterons sous peu pour organiser votre remboursement.",
    errName: "Veuillez entrer votre nom.",
    errEmail: "Veuillez entrer une adresse courriel valide.",
    errPay: "Veuillez indiquer votre mode de paiement.",
    errLocation: "Veuillez indiquer où se trouvait le distributeur.",
    errAmount: "Veuillez entrer le montant du remboursement.",
    errDetails: "Veuillez décrire ce qui s'est passé.",
    errGeneric:
      "Une erreur est survenue lors de l'envoi. Veuillez réessayer ou écrire à info@minimelts.ca.",
    switchTo: "English",
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RefundForm() {
  const [lang, setLang] = useState<Lang>("en");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [payMethod, setPayMethod] = useState(""); // "" | "cash" | "credit_debit"
  const [location, setLocation] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    if (q === "fr" || q === "en") setLang(q);
  }, []);

  const t = COPY[lang];

  async function handleSubmit() {
    setError(null);
    if (name.trim().length < 1) { setError(t.errName); return; }
    if (!EMAIL_RE.test(email.trim())) { setError(t.errEmail); return; }
    if (!payMethod) { setError(t.errPay); return; }
    if (location.trim().length < 1) { setError(t.errLocation); return; }
    if (amount.trim().length < 1) { setError(t.errAmount); return; }
    if (details.trim().length < 1) { setError(t.errDetails); return; }

    setStatus("sending");
    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          purchase_method: payMethod,
          location_text: location.trim(),
          refund_amount: amount.trim(),
          customer_note: details.trim(),
          lang,
          company_website: honeypot,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) { setStatus("idle"); setError(t.errGeneric); return; }
      setStatus("done");
    } catch (_e) {
      setStatus("idle"); setError(t.errGeneric);
    }
  }

  return (
    <div className="mm-wrap">
      <style>{`
        .mm-wrap {
          --teal:#34b3c4; --teal-dark:#2a93a1; --pink:#ef5a9c; --pink-dark:#e23f88;
          --ink:#3a4a52; --line:#d9dfe2; --muted:#9aa7ad;
          font-family:"Poppins","Quicksand","Trebuchet MS",system-ui,sans-serif;
          color:var(--ink); max-width:640px; margin:0 auto; padding:28px 20px 48px; box-sizing:border-box;
        }
        .mm-wrap * { box-sizing:border-box; }
        .mm-topbar { display:flex; justify-content:flex-end; margin-bottom:8px; }
        .mm-lang { background:none; border:none; cursor:pointer; color:var(--teal); font-weight:600;
          font-size:14px; font-family:inherit; padding:6px 8px; border-radius:8px; text-decoration:underline; text-underline-offset:3px; }
        .mm-lang:hover { color:var(--teal-dark); }
        .mm-heading { color:var(--teal); font-size:30px; line-height:1.15; font-weight:700; margin:0 0 10px; }
        .mm-intro { font-size:15px; line-height:1.55; color:var(--ink); margin:0 0 26px; }
        .mm-row { display:flex; gap:16px; }
        .mm-row .mm-field { flex:1; }
        @media (max-width:480px){ .mm-row { flex-direction:column; gap:0; } }
        .mm-field { margin-bottom:18px; }
        .mm-label { display:block; color:var(--teal); font-size:15px; font-weight:600; margin-bottom:7px; }
        .mm-label .mm-req { color:var(--muted); font-weight:400; font-size:13px; }
        .mm-input, .mm-textarea, .mm-select {
          width:100%; border:1px solid var(--line); border-radius:4px; background:#fafbfb;
          padding:12px 13px; font-size:15px; font-family:inherit; color:var(--ink); transition:border-color .15s, box-shadow .15s;
        }
        .mm-input:focus, .mm-textarea:focus, .mm-select:focus {
          outline:none; border-color:var(--teal); box-shadow:0 0 0 3px rgba(52,179,196,.15); background:#fff;
        }
        .mm-textarea { min-height:120px; resize:vertical; }
        .mm-hint { font-size:12px; color:var(--muted); margin-top:5px; }
        .mm-honeypot { position:absolute; left:-9999px; width:1px; height:1px; overflow:hidden; opacity:0; }
        .mm-btn {
          appearance:none; border:none; cursor:pointer; background:var(--pink); color:#fff; font-family:inherit;
          font-size:17px; font-weight:600; letter-spacing:.3px; padding:15px 42px; border-radius:999px; margin-top:6px;
          box-shadow:0 6px 18px rgba(239,90,156,.32); transition:background .15s, transform .08s, box-shadow .15s;
        }
        .mm-btn:hover:not(:disabled){ background:var(--pink-dark); box-shadow:0 8px 22px rgba(239,90,156,.4); }
        .mm-btn:active:not(:disabled){ transform:translateY(1px); }
        .mm-btn:disabled { opacity:.65; cursor:default; }
        .mm-error { background:#fdeef3; border:1px solid #f6c4d8; color:#b3245f; padding:12px 14px; border-radius:8px; font-size:14px; margin-bottom:18px; }
        .mm-success { text-align:center; padding:44px 20px; }
        .mm-success-badge { width:64px; height:64px; border-radius:50%; background:var(--teal); color:#fff;
          display:inline-flex; align-items:center; justify-content:center; font-size:34px; margin-bottom:18px;
          box-shadow:0 8px 20px rgba(52,179,196,.3); animation:mm-pop .35s ease; }
        @keyframes mm-pop { from{transform:scale(.6);opacity:0} to{transform:scale(1);opacity:1} }
        .mm-success-title { color:var(--teal); font-size:26px; font-weight:700; margin:0 0 10px; }
        .mm-success-body { font-size:16px; line-height:1.55; color:var(--ink); margin:0; }
      `}</style>

      {status === "done" ? (
        <div className="mm-success" role="status" aria-live="polite">
          <div className="mm-success-badge">✓</div>
          <h2 className="mm-success-title">{t.successTitle}</h2>
          <p className="mm-success-body">{t.successBody}</p>
        </div>
      ) : (
        <>
          <div className="mm-topbar">
            <button type="button" className="mm-lang" onClick={() => setLang(lang === "en" ? "fr" : "en")}>
              {t.switchTo}
            </button>
          </div>

          <h1 className="mm-heading">{t.heading}</h1>
          <p className="mm-intro">{t.intro}</p>

          {error && <div className="mm-error" role="alert">{error}</div>}

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-name">{t.name} <span className="mm-req">({t.required})</span></label>
            <input id="mm-name" className="mm-input" type="text" value={name}
              onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={200} />
          </div>

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-email">{t.email} <span className="mm-req">({t.required})</span></label>
              <input id="mm-email" className="mm-input" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" maxLength={320} />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-phone">{t.phone} <span className="mm-req">({t.optional})</span></label>
              <input id="mm-phone" className="mm-input" type="tel" value={phone}
                onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={40} />
            </div>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-pay">{t.payMethod} <span className="mm-req">({t.required})</span></label>
            <select id="mm-pay" className="mm-select" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
              <option value="">{t.payChoose}</option>
              <option value="cash">{t.payCash}</option>
              <option value="credit_debit">{t.payCard}</option>
            </select>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-loc">{t.location} <span className="mm-req">({t.required})</span></label>
            <input id="mm-loc" className="mm-input" type="text" value={location}
              onChange={(e) => setLocation(e.target.value)} maxLength={300} />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-amt">{t.amount} <span className="mm-req">({t.required})</span></label>
            <input id="mm-amt" className="mm-input" type="text" value={amount}
              onChange={(e) => setAmount(e.target.value)} maxLength={40} placeholder={t.amountHint} />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-details">{t.details} <span className="mm-req">({t.required})</span></label>
            <textarea id="mm-details" className="mm-textarea" value={details}
              onChange={(e) => setDetails(e.target.value)} maxLength={5000} />
          </div>

          <div className="mm-honeypot" aria-hidden="true">
            <label htmlFor="company_website">Company website</label>
            <input id="company_website" name="company_website" type="text" tabIndex={-1}
              autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>

          <button type="button" className="mm-btn" onClick={handleSubmit} disabled={status === "sending"}>
            {status === "sending" ? t.sending : t.send}
          </button>
        </>
      )}
    </div>
  );
}
