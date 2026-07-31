"use client";

import { useEffect, useRef, useState } from "react";

const FN_BASE = "https://jheqxfkyxewofpnkbayc.supabase.co/functions/v1";

// Institution names are fetched from the server, not hardcoded here.
//
// This file previously carried its own copy of the list, compiled from memory.
// Checking it against Payments Canada's members directory found five wrong
// entries -- 829 was labelled "Alberta Central (incl. Servus, Connect First)"
// when 829 is Caisse Desjardins Ontario, so a Desjardins customer entering
// their correct number was shown a bank in another province and might
// reasonably have "corrected" a right number to a wrong one.
//
// list_financial_institutions() returns number + display label only, with
// internal annotations filtered server-side. Fetching also means an admin can
// add a missing institution without this page being redeployed -- which matters
// during the conversion campaign, when gaps surface as customers hit them.

// Phone photos of a cheque routinely run 3-8 MB, which would blow the edge
// function request limit if sent raw. Downscaling to 1600px on the long edge
// keeps the MICR line comfortably legible for an admin comparing digits while
// landing the payload around 200-400 KB.
const VOID_MAX_DIM = 1600;
const VOID_JPEG_Q = 0.8;
const VOID_MAX_PDF_BYTES = 4_000_000;

function downscaleImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, VOID_MAX_DIM / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) { reject(new Error("no_ctx")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL("image/jpeg", VOID_JPEG_Q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("bad_image")); };
    img.src = url;
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = () => reject(new Error("read_failed"));
    fr.readAsDataURL(file);
  });
}

const TEMPLATES: Record<string, Record<string, string>> = {
  ice_cream: {
    en: "Mini Melts Ice Cream Freezer Program Agreement.pdf",
    fr: "Mini Melts Ice Cream Freezer Program Agreement FR.pdf",
  },
  sorbet: {
    en: "Mini Melts Sorbet Freezer Program Agreement.pdf",
    fr: "Mini Melts Sorbet Freezer Program Agreement FR.pdf",
  },
  pad: {
    en: "MiniMelts-PAD-Agreement-EN 2026.pdf",
    fr: "MiniMelts-PAD-Agreement-FR 2026.pdf",
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
    signedTag: "Signed",
    signHeading: "Sign your agreement",
    signHeadingPlural: "Sign your agreements",
    appliesAll: "One signature applies to every agreement above.",
    ackRead: "I have read and agree to the agreement(s) above.",
    ackMin: "I commit to the annual minimum purchase requirement for each program above.",
    ackSms: "I’d like to receive SMS updates about orders and deliveries (optional — Section 13).",
    name: "Full name",
    titleLbl: "Title",
    titlePh: "e.g. Owner, Manager",
    signature: "Signature",
    drawHint: "Draw your signature with your finger or mouse",
    clear: "Clear",
    sign: "Sign agreement",
    signPlural: "Sign agreements",
    signing: "Signing…",
    allDoneTitle: "All done!",
    allDoneBody:
      "Thank you. A signed copy has been emailed to you. We’ll be in touch about getting your freezer set up.",
    errGeneric: "Something didn’t go through. Please try again.",
    perOrder: "per order",
    perYear: "per year",
    perMonth: "month",
    progPad: "Pre-Authorized Debit (PAD)",
    bankHeading: "Banking details",
    padNote: "Your banking details are encrypted and stored securely. No debit will exceed $2,500.",
    acctHolder: "Account holder name",
    fiName: "Financial institution name",
    transit: "Transit number (5 digits)",
    institution: "Institution number (3 digits)",
    account: "Account number",
    acctType: "Account type",
    chk: "Chequing",
    sav: "Savings",
    ackAuthorize: "I authorize Mini Melts to debit this account for amounts owing on my Mini Melts account, per the PAD agreement above (variable business PAD, Payments Canada Rule H1).",
    ackAuthority: "I am authorized to bind this account. If this account requires more than one authorized signatory, all required signatories have consented to this authorization.",
    locHeading: "Locations covered by this authorization",
    locNote: "Untick any location that pays from a different bank account \u2014 you can set those up separately with the link sent for each one.",
    locNone: "Select at least one location.",
    fiUnknown: "We don\u2019t recognize this institution number. Please double-check it against your VOID cheque \u2014 you can still continue.",
    voidHeading: "VOID cheque (optional, recommended)",
    voidNote: "Attaching a VOID cheque or bank confirmation lets us verify the numbers above and prevents a failed or misdirected debit. It is stored securely, never emailed, and deleted once verified.",
    voidPick: "Choose file or take a photo",
    voidAttached: "Attached",
    voidRemove: "Remove",
    voidTooBig: "That file is too large. Please attach a photo or a PDF under 4 MB.",
    voidFailed: "We couldn\u2019t read that file. Try a photo instead.",
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
    signedTag: "Signée",
    signHeading: "Signez votre entente",
    signHeadingPlural: "Signez vos ententes",
    appliesAll: "Une seule signature s’applique à toutes les ententes ci-dessus.",
    ackRead: "J’ai lu et j’accepte la ou les ententes ci-dessus.",
    ackMin: "Je m’engage à respecter l’exigence minimale d’achat annuelle pour chaque programme ci-dessus.",
    ackSms: "Je souhaite recevoir des messages texte concernant les commandes et livraisons (facultatif — article 13).",
    name: "Nom complet",
    titleLbl: "Titre",
    titlePh: "p. ex. propriétaire, gérant",
    signature: "Signature",
    drawHint: "Dessinez votre signature avec le doigt ou la souris",
    clear: "Effacer",
    sign: "Signer l’entente",
    signPlural: "Signer les ententes",
    signing: "Signature en cours…",
    allDoneTitle: "C’est fait!",
    allDoneBody:
      "Merci. Une copie signée vous a été envoyée par courriel. Nous communiquerons avec vous pour l’installation de votre congélateur.",
    errGeneric: "Une erreur s’est produite. Veuillez réessayer.",
    perOrder: "par commande",
    perYear: "par année",
    perMonth: "mois",
    progPad: "Débit préautorisé (DPA)",
    bankHeading: "Renseignements bancaires",
    padNote: "Vos renseignements bancaires sont chiffrés et stockés de façon sécurisée. Aucun débit ne dépassera 2 500 $.",
    acctHolder: "Nom du titulaire du compte",
    fiName: "Nom de l’institution financière",
    transit: "Numéro de transit (5 chiffres)",
    institution: "Numéro d’institution (3 chiffres)",
    account: "Numéro de compte",
    acctType: "Type de compte",
    chk: "Chèques",
    sav: "Épargne",
    ackAuthorize: "J’autorise Mini Melts à débiter ce compte pour les montants dus à mon compte Mini Melts, conformément à l’entente de DPA ci-dessus (DPA d’entreprise à montant variable, Règle H1 de Paiements Canada).",
    ackAuthority: "Je suis autoris\u00e9 \u00e0 engager ce compte. Si ce compte exige plus d\u2019un signataire autoris\u00e9, tous les signataires requis ont consenti \u00e0 cette autorisation.",
    locHeading: "\u00c9tablissements vis\u00e9s par cette autorisation",
    locNote: "D\u00e9cochez tout \u00e9tablissement qui paie \u00e0 partir d\u2019un autre compte bancaire \u2014 vous pourrez les configurer s\u00e9par\u00e9ment avec le lien envoy\u00e9 pour chacun.",
    locNone: "S\u00e9lectionnez au moins un \u00e9tablissement.",
    fiUnknown: "Nous ne reconnaissons pas ce num\u00e9ro d\u2019institution. Veuillez le v\u00e9rifier sur votre ch\u00e8que ANNUL\u00c9 \u2014 vous pouvez tout de m\u00eame continuer.",
    voidHeading: "Ch\u00e8que ANNUL\u00c9 (facultatif, recommand\u00e9)",
    voidNote: "Joindre un ch\u00e8que ANNUL\u00c9 ou une confirmation bancaire nous permet de v\u00e9rifier les num\u00e9ros ci-dessus et d\u2019\u00e9viter un d\u00e9bit refus\u00e9 ou mal dirig\u00e9. Le fichier est conserv\u00e9 de fa\u00e7on s\u00e9curitaire, jamais envoy\u00e9 par courriel, et supprim\u00e9 apr\u00e8s v\u00e9rification.",
    voidPick: "Choisir un fichier ou prendre une photo",
    voidAttached: "Joint",
    voidRemove: "Retirer",
    voidTooBig: "Ce fichier est trop volumineux. Veuillez joindre une photo ou un PDF de moins de 4 Mo.",
    voidFailed: "Nous n\u2019avons pas pu lire ce fichier. Essayez plut\u00f4t une photo.",
  },
};

function money(n: unknown, lang: string): string {
  const v = Number(n);
  if (!isFinite(v)) return String(n ?? "");
  const s = v.toLocaleString(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency: "CAD" });
  return s.replace(/,00\s*\$$/, " $").replace(/\.00$/, "");
}

function termsLines(program: string, terms: any, lang: string): string[] {
  const t = T[lang];
  if (program === "pad") {
    return lang === "fr"
      ? [
          "Débit préautorisé d’entreprise (Règle H1 de Paiements Canada)",
          "Montant variable — chaque débit correspond à votre facture ou bon de livraison Mini Melts",
          `Maximum de ${money(terms.max_debit, lang)} par débit`,
          "Annulable en tout temps avec un préavis écrit de 30 jours",
        ]
      : [
          "Business pre-authorized debit (Payments Canada Rule H1)",
          "Variable amount — each debit matches your Mini Melts invoice or delivery receipt",
          `Up to ${money(terms.max_debit, lang)} per debit`,
          "Cancel anytime with 30 days’ written notice",
        ];
  }
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

function useSignaturePad(onChange: (d: string | null) => void) {
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

  return { canvasRef, down, move, up, clear };
}

export default function SignPage({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [invalid, setInvalid] = useState(false);
  const [session, setSession] = useState<any>(null);
  const [signedSet, setSignedSet] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [globalErr, setGlobalErr] = useState("");
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
  const progName = (p: string) => (p === "pad" ? t.progPad : p === "sorbet" ? t.progSorbet : t.progIce);
  const agreements = (session?.agreements || []) as any[];
  const pending = agreements.filter((a) => !signedSet.has(a.program));
  const allDone = !!session && agreements.length > 0 && pending.length === 0;
  const r = session?.retailer || {};
  const locations = (session?.locations || []) as any[];
  // number -> display label, filtered server-side so internal annotations
  // ("Alternate to 869", conflict notes) never reach a customer.
  const institutionMap = (session?.institutions || {}) as Record<string, string>;

  const signAll = async (payload: any) => {
    setBusy(true);
    setGlobalErr("");
    const toSign = agreements.filter((a) => !signedSet.has(a.program));
    let anyFail = false;
    for (const a of toSign) {
      try {
        let res: Response;
        if (a.program === "pad") {
          res = await fetch(`${FN_BASE}/submit-pad-mandate`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token,
              account_holder_name: payload.acctHolder,
              fi_name: payload.fiName,
              transit: payload.transit,
              institution: payload.institution,
              account: payload.account,
              account_type: payload.acctType,
              signer_name: payload.name,
              signer_title: payload.title,
              authorized: payload.authorized,
              authority_confirmed: payload.authority,
              signature_image: payload.sig,
              // Optional; omitted entirely rather than sent as null so the
              // server's data-URL check stays simple.
              ...(payload.voidImg ? { void_cheque_image: payload.voidImg } : {}),
              // Grouped signing. The server re-validates every id (open
              // invitation + shared email) before attaching banking to it, so
              // this list is a request, not an instruction.
              ...(payload.storeIds && payload.storeIds.length
                ? { store_ids: payload.storeIds }
                : {}),
              lang,
            }),
          });
        } else {
          res = await fetch(`${FN_BASE}/submit-signature`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              token,
              program: a.program,
              signer_name: payload.name,
              signer_title: payload.title,
              signature_image: payload.sig,
              ack_read: payload.read,
              ack_minimum: payload.minimum,
              sms_consent: payload.sms,
              lang,
            }),
          });
        }
        const data = await res.json();
        if (data && (data.ok || data.error === "already_signed")) {
          setSignedSet((prev) => {
            const n = new Set(prev);
            n.add(a.program);
            return n;
          });
        } else if (data && data.error === "invalid_or_expired") {
          setInvalid(true);
          setBusy(false);
          return;
        } else {
          anyFail = true;
        }
      } catch {
        anyFail = true;
      }
    }
    setBusy(false);
    if (anyFail) setGlobalErr(t.errGeneric);
  };

  return (
    <div className="mm-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mm-head">
        <div className="mm-brand">MINI MELTS</div>
        <div className="mm-lang">
          <button className={lang === "en" ? "on" : ""} onClick={() => { userPicked.current = true; setLang("en"); }}>EN</button>
          <button className={lang === "fr" ? "on" : ""} onClick={() => { userPicked.current = true; setLang("fr"); }}>FR</button>
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
            <Row k={t.address} v={[r.addr1, r.city, r.province, r.postal].filter(Boolean).join(", ")} />
            <Row k={t.email} v={r.email} />
            <Row k={t.phone} v={r.phone} />
            <div className="mm-muted">{t.notRight}</div>
          </div>

          {agreements.map((a) => (
            <div className="mm-card" key={a.program}>
              <div className="mm-prog-head">
                <h3 className="mm-card-title" style={{ margin: 0 }}>{progName(a.program)}</h3>
                {signedSet.has(a.program) && (
                  <span className="mm-prog-badge"><span className="tick">✓</span> {t.signedTag}</span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#7a8488", margin: "10px 0 6px" }}>{t.keyTerms}</div>
              <ul className="mm-terms">
                {termsLines(a.program, a.terms || {}, lang).map((l: string, i: number) => <li key={i}>{l}</li>)}
              </ul>
              <a className="mm-link" href={templateUrl(a.program, lang)} target="_blank" rel="noopener noreferrer">{t.viewFull}</a>
            </div>
          ))}

          {allDone ? (
            <div className="mm-card mm-success">
              <div className="big">🎉</div>
              <h2>{t.allDoneTitle}</h2>
              <p>{t.allDoneBody}</p>
            </div>
          ) : (
            <SigningSection
              t={t}
              count={pending.length}
              hasPad={pending.some((a) => a.program === "pad")}
              isLead={session?.session_type !== "store"}
              busy={busy}
              err={globalErr}
              defaults={{ name: r.contact_name || "", title: r.applicant_title || "", legalName: r.legal_name || "" }}
              locations={locations}
              instMap={institutionMap}
              onSign={signAll}
            />
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

function SigningSection({ t, count, hasPad, isLead, busy, err, defaults, locations, instMap, onSign }: any) {
  const [name, setName] = useState(defaults.name || "");
  const [title, setTitle] = useState(defaults.title || "");
  const [read, setRead] = useState(false);
  const [minimum, setMinimum] = useState(false);
  const [sms, setSms] = useState(false);
  const [sig, setSig] = useState<string | null>(null);
  // PAD-only fields (rendered only when a pad agreement is pending)
  const [acctHolder, setAcctHolder] = useState(defaults.legalName || "");
  const [transit, setTransit] = useState("");
  const [institution, setInstitution] = useState("");
  const [account, setAccount] = useState("");
  const [acctType, setAcctType] = useState("CHK");
  const [authorized, setAuthorized] = useState(false);
  // Section 10 of the agreement asks the Payor to confirm signing authority and
  // that any other required account holders consented. The page never used to
  // collect it, so the signed copy asserted something nobody was asked.
  const [authority, setAuthority] = useState(false);
  // Optional VOID cheque. Held in memory as a data URL and posted with the
  // mandate; never uploaded separately, never retained by the browser.
  const [voidImg, setVoidImg] = useState<string | null>(null);
  const [voidName, setVoidName] = useState("");
  const [voidErr, setVoidErr] = useState("");
  const pad = useSignaturePad(setSig);

  // Grouped signing. locations[0] is always the invited store; a list of one
  // means there is nothing to choose and no checklist is rendered. Everything
  // starts ticked because covering every location is the common case.
  const locs = (locations || []) as any[];
  const multiLoc = locs.length > 1;
  const [selectedIds, setSelectedIds] = useState<string[]>(() => locs.map((l: any) => l.store_id));
  const toggleLoc = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // Institution confirmation. Only meaningful once all 3 digits are in.
  // Supplied by get-signing-session. This page talks only to edge functions --
  // no Supabase client, no anon key in the customer-facing bundle -- so the
  // institution list arrives with the session rather than from a separate call.
  const institutions: Record<string, string> = instMap || {};
  // While the list is still loading, say nothing rather than warn: showing
  // "we don't recognize this" because the session hasn't returned yet would be
  // alarming and wrong.
  const fiLoaded = Object.keys(institutions).length > 0;
  const fiKnown = institution.length === 3 && !!institutions[institution];
  const fiLabel = fiKnown ? institutions[institution] : "";
  const fiUnknown = fiLoaded && institution.length === 3 && !fiKnown;

  const onVoidPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setVoidErr("");
    try {
      if (f.type === "application/pdf") {
        if (f.size > VOID_MAX_PDF_BYTES) { setVoidErr(t.voidTooBig); return; }
        setVoidImg(await fileToDataUrl(f));
        setVoidName(f.name);
        return;
      }
      // Everything else goes through the canvas, which both shrinks it and
      // normalizes HEIC/odd formats the browser can decode but the server
      // would rather not deal with.
      setVoidImg(await downscaleImage(f));
      setVoidName(f.name);
    } catch {
      setVoidErr(t.voidFailed);
    }
  };

  const bankOk =
    /^\d{5}$/.test(transit) && /^\d{3}$/.test(institution) && /^\d{4,17}$/.test(account);
  // An unrecognized institution number is deliberately NOT a blocker: the list
  // above is incomplete, so refusing would turn a gap in our data into a
  // refused customer. The server flags it for review instead.
  const locOk = !multiLoc || selectedIds.length > 0;
  const padOk = !hasPad || (bankOk && authorized && authority && locOk);
  // The minimum-purchase ack is only required when it is rendered (lead
  // sessions). Store PAD conversions never see it, so requiring it would
  // leave the button permanently disabled.
  const canSign = !!name.trim() && read && (!isLead || minimum) && !!sig && padOk && !busy;
  const many = count > 1;

  return (
    <div className="mm-card">
      <h3 className="mm-card-title">{many ? t.signHeadingPlural : t.signHeading}</h3>
      {many && <div className="mm-sign-note">{t.appliesAll}</div>}

      <label className="mm-check-row">
        <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} />
        <span>{t.ackRead}</span>
      </label>
      {isLead && (
        <>
          <label className="mm-check-row">
            <input type="checkbox" checked={minimum} onChange={(e) => setMinimum(e.target.checked)} />
            <span>{t.ackMin}</span>
          </label>
          <label className="mm-check-row">
            <input type="checkbox" checked={sms} onChange={(e) => setSms(e.target.checked)} />
            <span>{t.ackSms}</span>
          </label>
        </>
      )}

      {hasPad && multiLoc && (
        <div className="mm-locs">
          <div className="mm-bank-title">{t.locHeading}</div>
          <div className="mm-muted" style={{ marginTop: 0, marginBottom: 10 }}>{t.locNote}</div>
          {locs.map((l: any) => (
            <label className="mm-check-row" key={l.store_id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(l.store_id)}
                onChange={() => toggleLoc(l.store_id)}
              />
              <span>
                {l.name}
                {l.city ? <span className="mm-loc-sub"> \u2014 {l.city}</span> : null}
                {l.public_code ? <span className="mm-loc-sub"> ({l.public_code})</span> : null}
              </span>
            </label>
          ))}
          {selectedIds.length === 0 ? <div className="mm-err">{t.locNone}</div> : null}
        </div>
      )}

      {hasPad && (
        <div className="mm-bank">
          <div className="mm-bank-title">{t.bankHeading}</div>
          <div className="mm-muted" style={{ marginTop: 0, marginBottom: 10 }}>{t.padNote}</div>
          <div className="mm-field">
            <label>{t.acctHolder}</label>
            <input className="mm-input" value={acctHolder} onChange={(e) => setAcctHolder(e.target.value)} />
          </div>
          <div className="mm-field">
            <label>{t.transit}</label>
            <input className="mm-input" inputMode="numeric" maxLength={5} value={transit}
              onChange={(e) => setTransit(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="mm-field">
            <label>{t.institution}</label>
            <input className="mm-input" inputMode="numeric" maxLength={3} value={institution}
              onChange={(e) => setInstitution(e.target.value.replace(/\D/g, ""))} />
            {/* Derived, not typed. Seeing their own bank name appear is the
                signer confirming their own entry, which is what actually
                catches a mistyped digit. */}
            {fiKnown ? <div className="mm-fi-ok">{fiLabel}</div> : null}
            {fiUnknown ? <div className="mm-fi-warn">{t.fiUnknown}</div> : null}
          </div>
          <div className="mm-field">
            <label>{t.account}</label>
            <input className="mm-input" inputMode="numeric" value={account}
              onChange={(e) => setAccount(e.target.value.replace(/\D/g, ""))} />
          </div>
          <div className="mm-field">
            <label>{t.acctType}</label>
            <select className="mm-input" value={acctType} onChange={(e) => setAcctType(e.target.value)}>
              <option value="CHK">{t.chk}</option>
              <option value="SAV">{t.sav}</option>
            </select>
          </div>
          <label className="mm-check-row">
            <input type="checkbox" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
            <span>{t.ackAuthorize}</span>
          </label>
          <label className="mm-check-row">
            <input type="checkbox" checked={authority} onChange={(e) => setAuthority(e.target.checked)} />
            <span>{t.ackAuthority}</span>
          </label>

          <div className="mm-void">
            <div className="mm-bank-title">{t.voidHeading}</div>
            <div className="mm-muted" style={{ marginTop: 0, marginBottom: 10 }}>{t.voidNote}</div>
            {voidImg ? (
              <div className="mm-void-has">
                <span>{t.voidAttached}: {voidName}</span>
                <button
                  type="button"
                  className="mm-clear"
                  onClick={() => { setVoidImg(null); setVoidName(""); setVoidErr(""); }}
                >
                  {t.voidRemove}
                </button>
              </div>
            ) : (
              <label className="mm-void-pick">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={onVoidPick}
                  style={{ display: "none" }}
                />
                <span>{t.voidPick}</span>
              </label>
            )}
            {voidErr ? <div className="mm-err">{voidErr}</div> : null}
          </div>
        </div>
      )}

      <div className="mm-field">
        <label>{t.name}</label>
        <input className="mm-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="mm-field">
        <label>{t.titleLbl}</label>
        <input className="mm-input" placeholder={t.titlePh} value={title} onChange={(e) => setTitle(e.target.value)} />
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
            <button type="button" className="mm-clear" onClick={() => { pad.clear(); setSig(null); }}>{t.clear}</button>
          </div>
        </div>
      </div>

      {err ? <div className="mm-err">{err}</div> : null}

      <button
        className="mm-btn"
        disabled={!canSign}
        onClick={() =>
          onSign({
            name: name.trim(), title: title.trim(), read, minimum, sms, sig,
            acctHolder: acctHolder.trim(), fiName: fiLabel,
            transit, institution, account, acctType, authorized,
            authority, voidImg,
            storeIds: multiLoc ? selectedIds : locs.map((l: any) => l.store_id),
          })
        }
      >
        {busy ? t.signing : many ? t.signPlural : t.sign}
      </button>
    </div>
  );
}

const CSS = `
.mm-locs{border:1px solid #e6e8ee;border-radius:10px;padding:14px;margin:14px 0}
.mm-loc-sub{color:#6b7280;font-weight:400}
.mm-fi-ok{margin-top:6px;font-size:13px;color:#177245;font-weight:600}
.mm-fi-warn{margin-top:6px;font-size:13px;color:#9a6700;line-height:1.4}
.mm-void{margin-top:14px;padding-top:14px;border-top:1px solid #e6e8ee}
.mm-void-pick{display:inline-block;padding:10px 14px;border:1px dashed #b9bfcc;border-radius:8px;cursor:pointer;font-size:14px;color:#34495e}
.mm-void-pick:hover{border-color:#34b3c4;color:#34b3c4}
.mm-void-has{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:14px;background:#f6f8fa;border-radius:8px;padding:10px 12px}

.mm-wrap{max-width:640px;margin:0 auto;padding:24px 16px 64px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a}
.mm-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}
.mm-brand{font-weight:800;font-size:20px;color:#ef5a9c;letter-spacing:.3px}
.mm-title{font-size:18px;font-weight:700;margin:6px 0 16px}
.mm-lang{display:flex;gap:4px;font-size:13px}
.mm-lang button{border:1px solid #d7dde0;background:#fff;color:#555;padding:4px 11px;border-radius:999px;cursor:pointer}
.mm-lang button.on{background:#34b3c4;border-color:#34b3c4;color:#fff}
.mm-card{border:1px solid #e6eaec;border-radius:14px;padding:18px;margin:14px 0;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.04)}
.mm-card-title{font-size:16px;font-weight:700;color:#34b3c4;margin:0 0 12px}
.mm-prog-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mm-prog-badge{display:inline-flex;align-items:center;gap:6px;color:#2c8a5a;font-weight:700;font-size:13px}
.mm-prog-badge .tick{width:20px;height:20px;border-radius:50%;background:#2c8a5a;color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px}
.mm-row{display:flex;gap:8px;font-size:14px;padding:3px 0}
.mm-row .k{color:#7a8488;min-width:120px}
.mm-row .v{font-weight:600}
.mm-muted{font-size:12.5px;color:#8a9296;margin-top:10px}
.mm-terms{list-style:none;padding:0;margin:0 0 14px}
.mm-terms li{position:relative;padding:5px 0 5px 18px;font-size:14px;line-height:1.45}
.mm-terms li:before{content:"";position:absolute;left:0;top:11px;width:6px;height:6px;border-radius:50%;background:#ef5a9c}
.mm-link{display:inline-block;color:#34b3c4;font-weight:600;font-size:14px;text-decoration:none;border-bottom:1px solid #bfe6ec;padding-bottom:1px}
.mm-sign-note{font-size:12.5px;color:#8a9296;margin:-4px 0 12px}
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
.mm-success{text-align:center}
.mm-success .big{font-size:40px;margin-bottom:6px}
.mm-success h2{color:#34b3c4;margin:0 0 8px}
.mm-center{text-align:center;padding:60px 16px;color:#7a8488}
.mm-invalid{text-align:center}
.mm-invalid h2{color:#ef5a9c;margin:0 0 8px}\n.mm-bank{border:1px solid #e6eaec;border-radius:12px;padding:14px;margin:14px 0;background:#fbfcfc}\n.mm-bank-title{font-size:14px;font-weight:700;color:#34b3c4;margin-bottom:4px}
`;
