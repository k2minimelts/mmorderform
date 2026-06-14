"use client";

import { useEffect, useRef, useState } from "react";

const FN_BASE = "https://jheqxfkyxewofpnkbayc.supabase.co/functions/v1";

const TEMPLATES: Record<string, Record<string, string>> = {
  ice_cream: {
    en: "Mini Melts Ice Cream Freezer Program Agreement.pdf",
    fr: "Mini Melts Ice Cream Freezer Program Agreement FR.pdf",
  },
  sorbet: {
    en: "Mini Melts Sorbet Freezer Program Agreement.pdf",
    fr: "Mini Melts Sorbet Freezer Program Agreement FR.pdf",
  },
};
const templateUrl = (program: string, lang: string) =>
  `https://orders.minimelts.ca/agreements/${encodeURIComponent(
    (TEMPLATES[program] && (TEMPLATES[program][lang] || TEMPLATES[program].en)) || ""
  )}`;

const T: Record<string, Record<string, string>> = {
  en: {
    title: "Review & sign your freezer agreement",
    loading: "Loading…",
    invalidTitle: "This link is no longer valid",
    invalidBody:
      "This signing link has expired or has already been used. Please contact sales@minimelts.ca and we’ll send you a new one.",
    yourDetails: "Your details",
    notRight: "Not quite right? Contact sales@minimelts.ca before signing.",
    legal: "Legal name",
    operating: "Operating name",
    address: "Address",
    email: "Email",
    phone: "Phone",
    progIce: "Ice Cream Freezer Program",
    progSorbet: "Sorbet Freezer Program",
    keyTerms: "Key terms",
    viewFull: "View full agreement (PDF) ↗",
    ackRead: "I have read and agree to the terms of this agreement.",
    ackMin: "I commit to the annual minimum purchase requirement.",
    ackSms:
      "I’d like to receive SMS updates about orders and deliveries (optional — Section 13).",
    name: "Full name",
    titleLbl: "Title",
    titlePh: "e.g. Owner, Manager",
    signature: "Signature",
    drawHint: "Draw your signature with your finger or mouse",
    clear: "Clear",
    sign: "Sign agreement",
    signing: "Signing…",
    signed: "Signed",
    allDoneTitle: "All done!",
    allDoneBody:
      "Thank you. A signed copy has been emailed to you. We’ll be in touch about getting your freezer set up.",
    errGeneric: "Something went wrong. Please try again.",
    errAck: "Please check both required boxes to continue.",
    errSig: "Please add your signature.",
    errName: "Please enter your name.",
    perOrder: "per order",
    perYear: "per year",
    perMonth: "month",
  },
  fr: {
    title: "Consultez et signez votre entente de congélateur",
    loading: "Chargement…",
    invalidTitle: "Ce lien n’est plus valide",
    invalidBody:
      "Ce lien de signature a expiré ou a déjà été utilisé. Veuillez communiquer avec sales@minimelts.ca et nous vous en enverrons un nouveau.",
    yourDetails: "Vos coordonnées",
    notRight: "Une erreur? Communiquez avec sales@minimelts.ca avant de signer.",
    legal: "Nom légal",
    operating: "Nom d’exploitation",
    address: "Adresse",
    email: "Courriel",
    phone: "Téléphone",
    progIce: "Programme de congélateur (crème glacée)",
    progSorbet: "Programme de congélateur (sorbet)",
    keyTerms: "Modalités clés",
    viewFull: "Voir l’entente complète (PDF) ↗",
    ackRead: "J’ai lu et j’accepte les modalités de la présente entente.",
    ackMin: "Je m’engage à respecter l’exigence minimale d’achat annuelle.",
    ackSms:
      "Je souhaite recevoir des messages texte concernant les commandes et livraisons (facultatif — article 13).",
    name: "Nom complet",
    titleLbl: "Titre",
    titlePh: "p. ex. propriétaire, gérant",
    signature: "Signature",
    drawHint: "Dessinez votre signature avec le doigt ou la souris",
    clear: "Effacer",
    sign: "Signer l’entente",
    signing: "Signature en cours…",
    signed: "Signée",
    allDoneTitle: "C’est fait!",
    allDoneBody:
      "Merci. Une copie signée vous a été envoyée par courriel. Nous communiquerons avec vous pour l’installation de votre congélateur.",
    errGeneric: "Une erreur s’est produite. Veuillez réessayer.",
    errAck: "Veuillez cocher les deux cases requises pour continuer.",
    errSig: "Veuillez ajouter votre signature.",
    errName: "Veuillez saisir votre nom.",
    perOrder: "par commande",
    perYear: "par année",
    perMonth: "mois",
  },
};

function money(n: unknown, lang: string): string {
  const v = Number(n);
  if (!isFinite(v)) return String(n ?? "");
  const s = v.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", {
    style: "currency",
    currency: "CAD",
  });
  return s.replace(/,00\s*\$$/, " $").replace(/\.00$/, "");
}

function termsLines(program: string, terms: any, lang: string): string[] {
  const t = T[lang];
  const unit = program === "sorbet"
    ? (lang === "fr" ? "caisses" : "cases")
    : (lang === "fr" ? "unités" : "cups");
  const lines: string[] = [];
  if (program === "sorbet") {
    lines.push(
      lang === "fr"
        ? `${money(terms.case_price, lang)} par caisse (24 unités, ${money(terms.unit_price, lang)} ch.)`
        : `${money(terms.case_price, lang)} per case (24 units, ${money(terms.unit_price, lang)} each)`
    );
  } else {
    lines.push(
      lang === "fr"
        ? `${money(terms.unit_price, lang)} par unité`
        : `${money(terms.unit_price, lang)} per cup`
    );
  }
  lines.push(
    lang === "fr"
      ? `Commande initiale : au moins ${terms.initial_min} ${unit}`
      : `Initial order: at least ${terms.initial_min} ${unit}`
  );
  lines.push(
    lang === "fr"
      ? `Commandes suivantes : au moins ${terms.subsequent_min} ${unit}`
      : `Each later order: at least ${terms.subsequent_min} ${unit}`
  );
  lines.push(
    lang === "fr"
      ? `Minimum annuel : ${money(terms.annual_min, lang)} ${t.perYear} — sinon le congélateur devient une location de ${money(terms.rental_fee, lang)}/${t.perMonth}`
      : `Annual minimum: ${money(terms.annual_min, lang)} ${t.perYear} — otherwise the freezer becomes a ${money(terms.rental_fee, lang)}/${t.perMonth} rental`
  );
  lines.push(
    lang === "fr"
      ? `Frais de livraison : ${money(terms.delivery_fee, lang)} ${t.perOrder}`
      : `Delivery fee: ${money(terms.delivery_fee, lang)} ${t.perOrder}`
  );
  return lines;
}

function SignaturePad({ onChange }: { onChange: (d: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const inked = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a1a";
  }, []);

  const at = (e: React.PointerEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = at(e);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    const p = at(e);
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    inked.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (inked.current) onChange(canvasRef.current!.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    inked.current = false;
    onChange(null);
  };

  return { clear, canvasRef, down, move, up };
}

export default function SignPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [forms, setForms] = useState<Record<string, any>>({});
  const [signedSet, setSignedSet] = useState<Set<string>>(new Set());
  const [lang, setLang] = useState("en");
  const userPicked = useRef(false);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const l = sp.get("lang");
    if (l === "fr" || l === "en") {
      userPicked.current = true;
      setLang(l);
    }
  }, []);

  useEffect(() => {
    let active = true;
    if (!token) {
      setInvalid(true);
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`${FN_BASE}/get-signing-session`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await r.json();
        if (!active) return;
        if (!data || !data.ok) {
          setInvalid(true);
          setLoading(false);
          return;
        }
        const init: Record<string, any> = {};
        (data.agreements || []).forEach((a: any) => {
          init[a.program] = {
            name: data.retailer.contact_name || "",
            title: data.retailer.applicant_title || "",
            read: false,
            minimum: false,
            sms: false,
            sig: null,
            submitting: false,
            err: "",
          };
        });
        setForms(init);
        setSignedSet(
          new Set(
            (data.agreements || [])
              .filter((a: any) => a.status === "signed")
              .map((a: any) => a.program)
          )
        );
        if (data.lang && !userPicked.current) setLang(data.lang);
        setSession(data);
        setLoading(false);
      } catch {
        if (active) {
          setInvalid(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const t = T[lang];
  const setForm = (p: string, patch: any) =>
    setForms((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }));

  const submit = async (program: string) => {
    const f = forms[program];
    if (!f.name.trim()) return setForm(program, { err: t.errName });
    if (!f.read || !f.minimum) return setForm(program, { err: t.errAck });
    if (!f.sig) return setForm(program, { err: t.errSig });
    setForm(program, { submitting: true, err: "" });
    try {
      const r = await fetch(`${FN_BASE}/submit-signature`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          token,
          program,
          signer_name: f.name.trim(),
          signer_title: f.title.trim(),
          signature_image: f.sig,
          ack_read: f.read,
          ack_minimum: f.minimum,
          sms_consent: f.sms,
          lang,
        }),
      });
      const data = await r.json();
      if (data && (data.ok || data.error === "already_signed")) {
        setSignedSet((prev) => new Set(prev).add(program));
      } else if (data && data.error === "invalid_or_expired") {
        setInvalid(true);
      } else {
        setForm(program, { submitting: false, err: t.errGeneric });
      }
    } catch {
      setForm(program, { submitting: false, err: t.errGeneric });
    }
  };

  const progName = (p: string) => (p === "sorbet" ? t.progSorbet : t.progIce);

  const agreements = (session?.agreements || []) as any[];
  const pending = agreements.filter((a) => !signedSet.has(a.program));
  const allDone = !!session && agreements.length > 0 && pending.length === 0;
  const r = session?.retailer || {};

  return (
    <div className="mm-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mm-head">
        <div className="mm-brand">MINI MELTS</div>
        <div className="mm-lang">
          <button
            className={lang === "en" ? "on" : ""}
            onClick={() => {
              userPicked.current = true;
              setLang("en");
            }}
          >
            EN
          </button>
          <button
            className={lang === "fr" ? "on" : ""}
            onClick={() => {
              userPicked.current = true;
              setLang("fr");
            }}
          >
            FR
          </button>
        </div>
      </div>

      {loading && <div className="mm-center">{t.loading}</div>}

      {!loading && invalid && (
        <div className="mm-card mm-invalid">
          <h2>{t.invalidTitle}</h2>
          <p>{t.invalidBody}</p>
        </div>
      )}

      {!loading && !invalid && session && (
        <>
          <div className="mm-title">{t.title}</div>

          <div className="mm-card">
            <h3 className="mm-card-title">{t.yourDetails}</h3>
            <Row k={t.legal} v={r.legal_name} />
            {r.operating_name ? <Row k={t.operating} v={r.operating_name} /> : null}
            <Row
              k={t.address}
              v={[r.addr1, r.city, r.province, r.postal].filter(Boolean).join(", ")}
            />
            <Row k={t.email} v={r.email} />
            <Row k={t.phone} v={r.phone} />
            <div className="mm-muted">{t.notRight}</div>
          </div>

          {allDone && (
            <div className="mm-card mm-success">
              <div className="big">🎉</div>
              <h2>{t.allDoneTitle}</h2>
              <p>{t.allDoneBody}</p>
            </div>
          )}

          {agreements.map((a) =>
            signedSet.has(a.program) ? (
              <div className="mm-card" key={a.program}>
                <h3 className="mm-card-title">{progName(a.program)}</h3>
                <div className="mm-signed">
                  <span className="tick">✓</span> {t.signed}
                </div>
              </div>
            ) : (
              <AgreementCard
                key={a.program}
                a={a}
                lang={lang}
                t={t}
                form={forms[a.program]}
                setForm={(patch: any) => setForm(a.program, patch)}
                onSubmit={() => submit(a.program)}
                progName={progName(a.program)}
              />
            )
          )}
        </>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="mm-row">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function AgreementCard({ a, lang, t, form, setForm, onSubmit, progName }: any) {
  const pad = SignaturePad({ onChange: (d) => setForm({ sig: d }) });
  const canSign =
    !!form?.name?.trim() && form?.read && form?.minimum && !!form?.sig && !form?.submitting;

  return (
    <div className="mm-card">
      <h3 className="mm-card-title">{progName}</h3>

      <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8488", margin: "0 0 6px" }}>
        {t.keyTerms}
      </div>
      <ul className="mm-terms">
        {termsLines(a.program, a.terms || {}, lang).map((l: string, i: number) => (
          <li key={i}>{l}</li>
        ))}
      </ul>

      <a className="mm-link" href={templateUrl(a.program, lang)} target="_blank" rel="noopener noreferrer">
        {t.viewFull}
      </a>

      <label className="mm-check-row">
        <input type="checkbox" checked={!!form?.read} onChange={(e) => setForm({ read: e.target.checked })} />
        <span>{t.ackRead}</span>
      </label>
      <label className="mm-check-row">
        <input type="checkbox" checked={!!form?.minimum} onChange={(e) => setForm({ minimum: e.target.checked })} />
        <span>{t.ackMin}</span>
      </label>
      <label className="mm-check-row">
        <input type="checkbox" checked={!!form?.sms} onChange={(e) => setForm({ sms: e.target.checked })} />
        <span>{t.ackSms}</span>
      </label>

      <div className="mm-field">
        <label>{t.name}</label>
        <input
          className="mm-input"
          value={form?.name || ""}
          onChange={(e) => setForm({ name: e.target.value })}
        />
      </div>
      <div className="mm-field">
        <label>{t.titleLbl}</label>
        <input
          className="mm-input"
          placeholder={t.titlePh}
          value={form?.title || ""}
          onChange={(e) => setForm({ title: e.target.value })}
        />
      </div>

      <div className="mm-field">
        <label>{t.signature}</label>
        <div className="mm-sigwrap">
          <canvas
            ref={pad.canvasRef}
            className="mm-canvas"
            onPointerDown={pad.down}
            onPointerMove={pad.move}
            onPointerUp={pad.up}
            onPointerLeave={pad.up}
          />
          <div className="mm-sigbar">
            <span className="mm-sighint">{t.drawHint}</span>
            <button
              type="button"
              className="mm-clear"
              onClick={() => {
                pad.clear();
                setForm({ sig: null });
              }}
            >
              {t.clear}
            </button>
          </div>
        </div>
      </div>

      {form?.err ? <div className="mm-err">{form.err}</div> : null}

      <button className="mm-btn" disabled={!canSign} onClick={onSubmit}>
        {form?.submitting ? t.signing : t.sign}
      </button>
    </div>
  );
}

const CSS = `
.mm-wrap{max-width:640px;margin:0 auto;padding:24px 16px 64px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a}
.mm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
.mm-brand{font-weight:800;font-size:20px;color:#ef5a9c;letter-spacing:.3px}
.mm-title{font-size:18px;font-weight:700;margin:6px 0 16px}
.mm-lang{display:flex;gap:4px;font-size:13px}
.mm-lang button{border:1px solid #d7dde0;background:#fff;color:#555;padding:4px 11px;border-radius:999px;cursor:pointer}
.mm-lang button.on{background:#34b3c4;border-color:#34b3c4;color:#fff}
.mm-card{border:1px solid #e6eaec;border-radius:14px;padding:18px;margin:14px 0;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.mm-card-title{font-size:16px;font-weight:700;color:#34b3c4;margin:0 0 12px}
.mm-row{display:flex;gap:8px;font-size:14px;padding:3px 0}
.mm-row .k{color:#7a8488;min-width:120px}
.mm-row .v{font-weight:600}
.mm-muted{font-size:12.5px;color:#8a9296;margin-top:10px}
.mm-terms{list-style:none;padding:0;margin:0 0 14px}
.mm-terms li{position:relative;padding:5px 0 5px 18px;font-size:14px;line-height:1.45}
.mm-terms li:before{content:"";position:absolute;left:0;top:11px;width:6px;height:6px;border-radius:50%;background:#ef5a9c}
.mm-link{display:inline-block;margin-bottom:16px;color:#34b3c4;font-weight:600;font-size:14px;text-decoration:none;border-bottom:1px solid #bfe6ec;padding-bottom:1px}
.mm-check-row{display:flex;gap:10px;align-items:flex-start;margin:11px 0;font-size:13.5px;line-height:1.45;cursor:pointer}
.mm-check-row input{margin-top:1px;width:18px;height:18px;accent-color:#34b3c4;flex:0 0 auto}
.mm-field{margin:14px 0}
.mm-field>label{display:block;font-size:13px;font-weight:600;color:#555;margin-bottom:5px}
.mm-input{width:100%;box-sizing:border-box;border:1px solid #d7dde0;border-radius:10px;padding:11px 12px;font-size:15px;background:#fbfcfc}
.mm-input:focus{outline:none;border-color:#34b3c4;background:#fff}
.mm-sigwrap{border:1px dashed #c4ccd0;border-radius:10px;background:#fbfcfc;overflow:hidden}
.mm-canvas{display:block;width:100%;height:170px;touch-action:none;background:transparent;cursor:crosshair}
.mm-sigbar{display:flex;justify-content:space-between;align-items:center;border-top:1px solid #eceff0;padding:6px 10px}
.mm-sighint{font-size:12px;color:#9aa2a6}
.mm-clear{border:none;background:none;color:#ef5a9c;font-size:13px;font-weight:600;cursor:pointer}
.mm-btn{width:100%;margin-top:16px;border:none;border-radius:999px;background:#ef5a9c;color:#fff;font-size:16px;font-weight:700;padding:14px;cursor:pointer}
.mm-btn:disabled{background:#f3bcd5;cursor:not-allowed}
.mm-err{color:#d6336c;font-size:13px;margin-top:10px}
.mm-signed{display:flex;align-items:center;gap:10px;color:#2c8a5a;font-weight:700;font-size:15px}
.mm-signed .tick{width:24px;height:24px;border-radius:50%;background:#2c8a5a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px}
.mm-success{text-align:center}
.mm-success .big{font-size:40px;margin-bottom:6px}
.mm-success h2{color:#34b3c4;margin:0 0 8px}
.mm-center{text-align:center;padding:60px 16px;color:#7a8488}
.mm-invalid{text-align:center}
.mm-invalid h2{color:#ef5a9c;margin:0 0 8px}
`;
