"use client";

// app/partner/page.tsx
//
// Bilingual (EN/FR) partner lead-capture form for Mini Melts Canada.
// Designed to be iframed inside the Squarespace /en/contact and /fr/contact
// pages. Posts to the submit-lead Supabase edge function.
//
// Language:
//   - Initial language from ?lang=fr | ?lang=en (defaults to en).
//   - In-form toggle lets the user switch.
//   - The French Squarespace page should iframe  …/partner?lang=fr
//     and the English page  …/partner?lang=en
//
// Styling matches the existing Mini Melts contact page: teal labels,
// light inputs, pink pill submit button. Self-contained (inline styles +
// a <style> block) so it renders identically regardless of the host repo's
// global CSS — important for a page that lives in an iframe.

import { useEffect, useState } from "react";

const EDGE_FUNCTION_URL =
  "https://jheqxfkyxewofpnkbayc.supabase.co/functions/v1/submit-lead";

type Lang = "en" | "fr";

const COPY = {
  en: {
    heading: "Get in touch",
    intro:
      "Have a question, want to sell Mini Melts, or just want to say hello? Send us a note and our team will get back to you.",
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone",
    optional: "optional",
    required: "required",
    message: "Message",
    send: "Send",
    sending: "Sending…",
    successTitle: "Thank you!",
    successBody:
      "Your message has been received. Our team will get back to you shortly.",
    errName: "Please enter your first and last name.",
    errEmail: "Please enter a valid email address.",
    errMessage: "Please enter a message.",
    errGeneric:
      "Something went wrong sending your message. Please try again, or email info@minimelts.ca.",
    switchTo: "Français",
  },
  fr: {
    heading: "Contactez-nous",
    intro:
      "Une question, envie de vendre Mini Melts, ou simplement nous dire bonjour ? Écrivez-nous et notre équipe vous répondra.",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Courriel",
    phone: "Téléphone",
    optional: "facultatif",
    required: "requis",
    message: "Message",
    send: "Envoyer",
    sending: "Envoi…",
    successTitle: "Merci !",
    successBody:
      "Votre message a bien été reçu. Notre équipe vous répondra sous peu.",
    errName: "Veuillez entrer votre prénom et votre nom.",
    errEmail: "Veuillez entrer une adresse courriel valide.",
    errMessage: "Veuillez entrer un message.",
    errGeneric:
      "Une erreur est survenue lors de l'envoi. Veuillez réessayer ou écrire à info@minimelts.ca.",
    switchTo: "English",
  },
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function PartnerForm() {
  const [lang, setLang] = useState<Lang>("en");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState(""); // company_website — hidden
  const [status, setStatus] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  // Initial language from ?lang= query param.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("lang");
    if (q === "fr" || q === "en") setLang(q);
  }, []);

  const t = COPY[lang];

  async function handleSubmit() {
    setError(null);

    if (firstName.trim().length < 1 || lastName.trim().length < 1) {
      setError(t.errName);
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError(t.errEmail);
      return;
    }
    if (message.trim().length < 1) {
      setError(t.errMessage);
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          name: `${firstName.trim()} ${lastName.trim()}`.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          message: message.trim(),
          company_website: honeypot, // honeypot
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // 400 validation errors land here too
        setStatus("idle");
        setError(t.errGeneric);
        return;
      }
      setStatus("done");
    } catch (_e) {
      setStatus("idle");
      setError(t.errGeneric);
    }
  }

  return (
    <div className="mm-wrap">
      <style>{`
        .mm-wrap {
          --teal: #34b3c4;
          --teal-dark: #2a93a1;
          --pink: #ef5a9c;
          --pink-dark: #e23f88;
          --ink: #3a4a52;
          --line: #d9dfe2;
          --muted: #9aa7ad;
          font-family: "Poppins", "Quicksand", "Trebuchet MS", system-ui, sans-serif;
          color: var(--ink);
          max-width: 640px;
          margin: 0 auto;
          padding: 28px 20px 48px;
          box-sizing: border-box;
        }
        .mm-wrap * { box-sizing: border-box; }
        .mm-topbar {
          display: flex; justify-content: flex-end; margin-bottom: 8px;
        }
        .mm-lang {
          background: none; border: none; cursor: pointer;
          color: var(--teal); font-weight: 600; font-size: 14px;
          font-family: inherit; padding: 6px 8px; border-radius: 8px;
          text-decoration: underline; text-underline-offset: 3px;
        }
        .mm-lang:hover { color: var(--teal-dark); }
        .mm-heading {
          color: var(--teal); font-size: 30px; line-height: 1.15;
          font-weight: 700; margin: 0 0 10px;
        }
        .mm-intro { font-size: 15px; line-height: 1.55; color: var(--ink); margin: 0 0 26px; }
        .mm-row { display: flex; gap: 16px; }
        .mm-row .mm-field { flex: 1; }
        @media (max-width: 480px) { .mm-row { flex-direction: column; gap: 0; } }
        .mm-field { margin-bottom: 18px; }
        .mm-label {
          display: block; color: var(--teal); font-size: 15px;
          font-weight: 600; margin-bottom: 7px;
        }
        .mm-label .mm-req { color: var(--muted); font-weight: 400; font-size: 13px; }
        .mm-input, .mm-textarea {
          width: 100%; border: 1px solid var(--line); border-radius: 4px;
          background: #fafbfb; padding: 12px 13px; font-size: 15px;
          font-family: inherit; color: var(--ink); transition: border-color .15s, box-shadow .15s;
        }
        .mm-input:focus, .mm-textarea:focus {
          outline: none; border-color: var(--teal);
          box-shadow: 0 0 0 3px rgba(52,179,196,.15); background: #fff;
        }
        .mm-textarea { min-height: 132px; resize: vertical; }
        .mm-honeypot {
          position: absolute; left: -9999px; width: 1px; height: 1px;
          overflow: hidden; opacity: 0;
        }
        .mm-btn {
          appearance: none; border: none; cursor: pointer;
          background: var(--pink); color: #fff; font-family: inherit;
          font-size: 17px; font-weight: 600; letter-spacing: .3px;
          padding: 15px 42px; border-radius: 999px; margin-top: 6px;
          box-shadow: 0 6px 18px rgba(239,90,156,.32); transition: background .15s, transform .08s, box-shadow .15s;
        }
        .mm-btn:hover:not(:disabled) { background: var(--pink-dark); box-shadow: 0 8px 22px rgba(239,90,156,.4); }
        .mm-btn:active:not(:disabled) { transform: translateY(1px); }
        .mm-btn:disabled { opacity: .65; cursor: default; }
        .mm-error {
          background: #fdeef3; border: 1px solid #f6c4d8; color: #b3245f;
          padding: 12px 14px; border-radius: 8px; font-size: 14px; margin-bottom: 18px;
        }
        .mm-success {
          text-align: center; padding: 44px 20px;
        }
        .mm-success-badge {
          width: 64px; height: 64px; border-radius: 50%;
          background: var(--teal); color: #fff; display: inline-flex;
          align-items: center; justify-content: center; font-size: 34px;
          margin-bottom: 18px; box-shadow: 0 8px 20px rgba(52,179,196,.3);
          animation: mm-pop .35s ease;
        }
        @keyframes mm-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .mm-success-title { color: var(--teal); font-size: 26px; font-weight: 700; margin: 0 0 10px; }
        .mm-success-body { font-size: 16px; line-height: 1.55; color: var(--ink); margin: 0; }
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
            <button
              type="button"
              className="mm-lang"
              onClick={() => setLang(lang === "en" ? "fr" : "en")}
            >
              {t.switchTo}
            </button>
          </div>

          <h1 className="mm-heading">{t.heading}</h1>
          <p className="mm-intro">{t.intro}</p>

          {error && <div className="mm-error" role="alert">{error}</div>}

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-first">
                {t.firstName} <span className="mm-req">({t.required})</span>
              </label>
              <input
                id="mm-first" className="mm-input" type="text"
                value={firstName} onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name" maxLength={100}
              />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-last">
                {t.lastName} <span className="mm-req">({t.required})</span>
              </label>
              <input
                id="mm-last" className="mm-input" type="text"
                value={lastName} onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name" maxLength={100}
              />
            </div>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-email">
              {t.email} <span className="mm-req">({t.required})</span>
            </label>
            <input
              id="mm-email" className="mm-input" type="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" maxLength={320}
            />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-phone">
              {t.phone} <span className="mm-req">({t.optional})</span>
            </label>
            <input
              id="mm-phone" className="mm-input" type="tel"
              value={phone} onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel" maxLength={40}
            />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-message">
              {t.message} <span className="mm-req">({t.required})</span>
            </label>
            <textarea
              id="mm-message" className="mm-textarea"
              value={message} onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
            />
          </div>

          {/* Honeypot — hidden from users, bots fill it. Must stay out of tab order. */}
          <div className="mm-honeypot" aria-hidden="true">
            <label htmlFor="company_website">Company website</label>
            <input
              id="company_website" name="company_website" type="text"
              tabIndex={-1} autoComplete="off"
              value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          <button
            type="button" className="mm-btn"
            onClick={handleSubmit} disabled={status === "sending"}
          >
            {status === "sending" ? t.sending : t.send}
          </button>
        </>
      )}
    </div>
  );
}
