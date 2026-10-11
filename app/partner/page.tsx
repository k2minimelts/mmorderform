"use client";

// app/partner/page.tsx
//
// Bilingual (EN/FR) contact / partner form for Mini Melts Canada.
// Embedded (iframe) inside the Squarespace /en/contact and /fr/contact pages.
// Posts to the submit-lead Supabase edge function (feeds the dashboard).
//
// Language: set by the page that embeds it — …/partner?lang=fr or ?lang=en.
// (The site header already has the EN | FR toggle, so there is none here.)
//
// Height: the form tells the Squarespace page how tall it is (postMessage
// "mm-form-height"), so the iframe grows to fit and the site footer shows
// underneath instead of being hidden by a fixed-height embed.

import { useEffect, useRef, useState } from "react";

const EDGE_FUNCTION_URL =
  "https://jheqxfkyxewofpnkbayc.supabase.co/functions/v1/submit-lead";

type Lang = "en" | "fr";

const COPY = {
  en: {
    heading: "Get in touch",
    intro:
      "Questions, feedback, or interested in selling Mini Melts at your location? Send us a note and our team will get back to you.",
    firstName: "First name",
    lastName: "Last name",
    email: "Email",
    phone: "Phone",
    required: "required",
    message: "Message",
    send: "Send message",
    sending: "Sending…",
    successTitle: "Thank you!",
    successBody:
      "Your message has been received. Our team will get back to you shortly.",
    errName: "Please enter your first and last name.",
    errEmail: "Please enter a valid email address.",
    errPhone: "Please enter a valid phone number.",
    errMessage: "Please enter a message.",
    errGeneric:
      "Something went wrong sending your message. Please try again in a moment, or call us at (403) 537-1045.",
  },
  fr: {
    heading: "Nous joindre",
    intro:
      "Une question, un commentaire, ou envie de vendre Mini Melts dans votre établissement ? Écrivez-nous et notre équipe vous répondra.",
    firstName: "Prénom",
    lastName: "Nom",
    email: "Courriel",
    phone: "Téléphone",
    required: "requis",
    message: "Message",
    send: "Envoyer",
    sending: "Envoi…",
    successTitle: "Merci !",
    successBody:
      "Votre message a bien été reçu. Notre équipe vous répondra sous peu.",
    errName: "Veuillez entrer votre prénom et votre nom.",
    errEmail: "Veuillez entrer une adresse courriel valide.",
    errPhone: "Veuillez entrer un numéro de téléphone valide.",
    errMessage: "Veuillez entrer un message.",
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
  const wrapRef = useRef<HTMLDivElement>(null);

  // Language from ?lang=, falling back to the embedding page's address.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "fr" || q === "en") setLang(q);
    else if (/\/fr\//.test(document.referrer)) setLang("fr");
  }, []);

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
    return () => {
      ro.disconnect();
      window.removeEventListener("load", send);
    };
  }, []);

  useEffect(() => {
    if (status === "done") postToParent({ type: "mm-form-done" });
  }, [status]);

  const t = COPY[lang];

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    setError(null);

    if (firstName.trim().length < 1 || lastName.trim().length < 1) return setError(t.errName);
    if (!EMAIL_RE.test(email.trim())) return setError(t.errEmail);
    if (phone.replace(/\D/g, "").length < 10) return setError(t.errPhone);
    if (message.trim().length < 1) return setError(t.errMessage);

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
          phone: phone.trim(),
          message: message.trim(),
          company_website: honeypot, // honeypot
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
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
    <div className="mm-wrap" ref={wrapRef} lang={lang}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');

        html, body { margin: 0; padding: 0; background: transparent; }

        .mm-wrap {
          --cyan: #2bb8e6;
          --cyan-dark: #1a9fcb;
          --cyan-soft: #eaf8fd;
          --pink: #f0729f;
          --pink-dark: #e0558a;
          --ink: #1f2937;
          --muted: #6b7280;
          --line: #e5e7eb;
          font-family: "Poppins", system-ui, -apple-system, "Segoe UI", sans-serif;
          color: var(--ink);
          max-width: 620px;
          margin: 0 auto;
          padding: 8px 20px 24px;
          box-sizing: border-box;
          -webkit-font-smoothing: antialiased;
        }
        .mm-wrap * { box-sizing: border-box; }

        .mm-heading {
          color: var(--cyan); font-size: 34px; line-height: 1.15;
          font-weight: 700; margin: 0 0 10px; text-align: center;
        }
        .mm-intro {
          font-size: 16px; line-height: 1.6; color: var(--ink);
          margin: 0 auto 28px; text-align: center; max-width: 520px;
        }

        .mm-row { display: flex; gap: 16px; }
        .mm-row .mm-field { flex: 1; min-width: 0; }
        @media (max-width: 520px) {
          .mm-row { flex-direction: column; gap: 0; }
          .mm-heading { font-size: 28px; }
        }

        .mm-field { margin-bottom: 18px; }
        .mm-label {
          display: block; color: var(--ink); font-size: 14px;
          font-weight: 600; margin-bottom: 6px;
        }
        .mm-label .mm-req { color: var(--muted); font-weight: 400; }
        .mm-input, .mm-textarea {
          width: 100%; border: 1.5px solid var(--line); border-radius: 12px;
          background: #fff; padding: 13px 14px; font-size: 16px; /* 16px stops iPhone zoom */
          font-family: inherit; color: var(--ink);
          transition: border-color .15s, box-shadow .15s;
        }
        .mm-input:hover, .mm-textarea:hover { border-color: #cbd5e1; }
        .mm-input:focus, .mm-textarea:focus {
          outline: none; border-color: var(--cyan);
          box-shadow: 0 0 0 4px rgba(43,184,230,.15);
        }
        .mm-textarea { min-height: 150px; resize: vertical; line-height: 1.5; }

        .mm-honeypot {
          position: absolute; left: -9999px; width: 1px; height: 1px;
          overflow: hidden; opacity: 0;
        }

        .mm-actions { text-align: center; margin-top: 8px; }
        .mm-btn {
          appearance: none; border: none; cursor: pointer;
          background: var(--pink); color: #fff; font-family: inherit;
          font-size: 16px; font-weight: 600; letter-spacing: .02em;
          padding: 15px 44px; border-radius: 999px;
          box-shadow: 0 6px 18px rgba(240,114,159,.30);
          transition: background .15s, transform .08s, box-shadow .15s;
        }
        .mm-btn:hover:not(:disabled) { background: var(--pink-dark); box-shadow: 0 8px 22px rgba(240,114,159,.38); }
        .mm-btn:active:not(:disabled) { transform: translateY(1px); }
        .mm-btn:focus-visible { outline: 3px solid rgba(43,184,230,.5); outline-offset: 3px; }
        .mm-btn:disabled { opacity: .65; cursor: default; }
        @media (max-width: 520px) { .mm-btn { width: 100%; } }

        .mm-error {
          background: #fdeef4; border: 1px solid #f7c6d8; color: #b4235c;
          padding: 12px 14px; border-radius: 12px; font-size: 14px; margin-bottom: 18px;
        }

        .mm-success { text-align: center; padding: 36px 20px 28px; }
        .mm-success-badge {
          width: 68px; height: 68px; border-radius: 50%;
          background: var(--cyan); color: #fff; display: inline-flex;
          align-items: center; justify-content: center; font-size: 34px;
          margin-bottom: 18px; box-shadow: 0 8px 20px rgba(43,184,230,.3);
          animation: mm-pop .35s ease;
        }
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
          <h1 className="mm-heading">{t.heading}</h1>
          <p className="mm-intro">{t.intro}</p>

          {error && <div className="mm-error" role="alert">{error}</div>}

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-first">
                {t.firstName} <span className="mm-req">({t.required})</span>
              </label>
              <input
                id="mm-first" className="mm-input" type="text" required
                value={firstName} onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name" maxLength={100}
              />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-last">
                {t.lastName} <span className="mm-req">({t.required})</span>
              </label>
              <input
                id="mm-last" className="mm-input" type="text" required
                value={lastName} onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name" maxLength={100}
              />
            </div>
          </div>

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-email">
                {t.email} <span className="mm-req">({t.required})</span>
              </label>
              <input
                id="mm-email" className="mm-input" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" maxLength={320}
              />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="mm-phone">
                {t.phone} <span className="mm-req">({t.required})</span>
              </label>
              <input
                id="mm-phone" className="mm-input" type="tel" required
                value={phone} onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel" maxLength={40}
              />
            </div>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="mm-message">
                {t.message} <span className="mm-req">({t.required})</span>
              </label>
            <textarea
              id="mm-message" className="mm-textarea" required
              value={message} onChange={(e) => setMessage(e.target.value)}
              maxLength={5000}
            />
          </div>

          {/* Honeypot — hidden from people, bots fill it. Must stay out of tab order. */}
          <div className="mm-honeypot" aria-hidden="true">
            <label htmlFor="company_website">Company website</label>
            <input
              id="company_website" name="company_website" type="text"
              tabIndex={-1} autoComplete="off"
              value={honeypot} onChange={(e) => setHoneypot(e.target.value)}
            />
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
