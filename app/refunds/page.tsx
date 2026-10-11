"use client";

// app/refunds/page.tsx
//
// Bilingual (EN/FR) vending refund-request form for Mini Melts Canada.
// Iframed inside the Squarespace /refunds page. Posts to the submit-refund
// Supabase edge function. Same self-contained styling approach as the
// partner/contact form (inline <style> so it renders identically in an iframe).
//
// Language: ?lang=fr | ?lang=en (defaults en) + small EN | FR toggle
//   (matches the site header toggle). French page can iframe …/refunds?lang=fr
//
// Height: tells the Squarespace page its height (postMessage "mm-form-height")
// so the iframe fits and the site footer shows below it.

import { useEffect, useRef, useState } from "react";

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
      "Something went wrong submitting your request. Please try again in a moment, or call us at (403) 537-1045.",
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
      "Une erreur est survenue lors de l'envoi. Veuillez réessayer dans un instant ou nous appeler au 403 537-1045.",
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function postToParent(msg: Record<string, unknown>) {
  try {
    if (window.parent && window.parent !== window) window.parent.postMessage(msg, "*");
  } catch (_e) {
    /* not embedded */
  }
}

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
  const wrapRef = useRef<HTMLDivElement>(null);

  // Tell the Squarespace page how tall the form is, whenever it changes.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const send = () =>
      postToParent({ type: "mm-form-height", height: Math.ceil(el.getBoundingClientRect().height) });
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    window.addEventListener("load", send);
    return () => { ro.disconnect(); window.removeEventListener("load", send); };
  }, []);

  useEffect(() => {
    if (status === "done") postToParent({ type: "mm-form-done" });
  }, [status]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    if (q === "fr" || q === "en") setLang(q);
  }, []);

  const t = COPY[lang];

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
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
    <div className="mm-wrap" ref={wrapRef} lang={lang}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

        /* Inside the Squarespace page: blend in, and let the mouse wheel scroll the page around it */
        html, body {
          margin: 0 !important; padding: 0 !important; background: transparent !important;
          overscroll-behavior: auto !important; min-height: 0 !important;
        }

        .mm-wrap {
          --cyan: #2bb8e6; --cyan-soft: #eaf8fd;
          --pink: #f0729f; --pink-dark: #e0558a;
          --ink: #1f2937; --muted: #6b7280; --line: #e5e7eb;
          font-family: "Poppins", system-ui, -apple-system, "Segoe UI", sans-serif;
          color: var(--ink); max-width: 620px; margin: 0 auto; padding: 8px 20px 24px;
          box-sizing: border-box; -webkit-font-smoothing: antialiased;
        }
        .mm-wrap * { box-sizing: border-box; }

        /* EN | FR pill, same as the site header */
        .mm-topbar { display: flex; justify-content: flex-end; margin-bottom: 6px; }
        .mm-lang { display: inline-flex; border: 1.5px solid var(--cyan); border-radius: 999px; overflow: hidden; background: #fff; }
        .mm-lang button {
          appearance: none; border: 0; background: transparent; cursor: pointer; font-family: inherit;
          font-size: 13px; font-weight: 600; letter-spacing: .05em; line-height: 1;
          color: var(--cyan); padding: 6px 12px;
        }
        .mm-lang button + button { border-left: 1.5px solid var(--cyan); }
        .mm-lang button:hover { background: var(--cyan-soft); }
        .mm-lang button.is-active { background: var(--cyan); color: #fff; }

        .mm-heading { color: var(--cyan); font-size: 34px; line-height: 1.15; font-weight: 700; margin: 0 0 10px; text-align: center; }
        .mm-intro { font-size: 16px; line-height: 1.6; color: var(--ink); margin: 0 auto 28px; text-align: center; max-width: 520px; }

        .mm-row { display: flex; gap: 16px; }
        .mm-row .mm-field { flex: 1; min-width: 0; }
        @media (max-width: 520px) {
          .mm-row { flex-direction: column; gap: 0; }
          .mm-heading { font-size: 28px; }
        }

        .mm-field { margin-bottom: 18px; }
        .mm-label { display: block; color: var(--ink); font-size: 14px; font-weight: 600; margin-bottom: 6px; }
        .mm-label .mm-req { color: var(--muted); font-weight: 400; }
        .mm-input, .mm-textarea, .mm-select {
          width: 100%; border: 1.5px solid var(--line); border-radius: 12px; background: #fff;
          padding: 13px 14px; font-size: 16px; /* 16px stops iPhone zoom */
          font-family: inherit; color: var(--ink); transition: border-color .15s, box-shadow .15s;
        }
        .mm-select {
          appearance: none; -webkit-appearance: none; cursor: pointer; padding-right: 40px;
          background: #fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' fill='none' stroke='%232bb8e6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") no-repeat right 16px center;
        }
        .mm-input::placeholder { color: #9ca3af; }
        .mm-input:hover, .mm-textarea:hover, .mm-select:hover { border-color: #cbd5e1; }
        .mm-input:focus, .mm-textarea:focus, .mm-select:focus {
          outline: none; border-color: var(--cyan); box-shadow: 0 0 0 4px rgba(43,184,230,.15);
        }
        .mm-textarea { min-height: 140px; resize: vertical; line-height: 1.5; }
        .mm-honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; opacity: 0; }

        .mm-actions { text-align: center; margin-top: 8px; }
        .mm-btn {
          appearance: none; border: none; cursor: pointer; background: var(--pink); color: #fff; font-family: inherit;
          font-size: 16px; font-weight: 600; letter-spacing: .02em; padding: 15px 44px; border-radius: 999px;
          box-shadow: 0 6px 18px rgba(240,114,159,.30); transition: background .15s, transform .08s, box-shadow .15s;
        }
        .mm-btn:hover:not(:disabled) { background: var(--pink-dark); box-shadow: 0 8px 22px rgba(240,114,159,.38); }
        .mm-btn:active:not(:disabled) { transform: translateY(1px); }
        .mm-btn:focus-visible { outline: 3px solid rgba(43,184,230,.5); outline-offset: 3px; }
        .mm-btn:disabled { opacity: .65; cursor: default; }
        @media (max-width: 520px) { .mm-btn { width: 100%; } }

        .mm-error { background: #fdeef4; border: 1px solid #f7c6d8; color: #b4235c; padding: 12px 14px; border-radius: 12px; font-size: 14px; margin-bottom: 18px; }
        .mm-success { text-align: center; padding: 36px 20px 28px; }
        .mm-success-badge { width: 68px; height: 68px; border-radius: 50%; background: var(--cyan); color: #fff;
          display: inline-flex; align-items: center; justify-content: center; font-size: 34px; margin-bottom: 18px;
          box-shadow: 0 8px 20px rgba(43,184,230,.3); animation: mm-pop .35s ease; }
        @keyframes mm-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .mm-success-title { color: var(--cyan); font-size: 30px; font-weight: 700; margin: 0 0 10px; }
        .mm-success-body { font-size: 16px; line-height: 1.6; color: var(--ink); margin: 0; }
      `}</style>

      {status === "done" ? (
        <div className="mm-success" role="status" aria-live="polite">
          <div className="mm-success-badge">✓</div>
          <h2 className="mm-success-title">{t.successTitle}</h2>
          <p className="mm-success-body">{t.successBody}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="mm-topbar">
            <div className="mm-lang" role="group" aria-label="Language / Langue">
              <button type="button" className={lang === "en" ? "is-active" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
              <button type="button" className={lang === "fr" ? "is-active" : ""} aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>FR</button>
            </div>
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

          <div className="mm-actions">
            <button type="submit" className="mm-btn" disabled={status === "sending"}>
              {status === "sending" ? t.sending : t.send}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
