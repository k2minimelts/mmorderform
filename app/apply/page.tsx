"use client";

// app/apply/page.tsx
//
// Bilingual (EN/FR) NEW-ACCOUNT application form for Mini Melts Canada.
// Designed to be iframed inside the Squarespace marketing site (like the
// /partner and /refunds forms). Posts to the submit-application Supabase
// edge function, which runs the serviceability check + qualifying logic.
//
// Language:
//   - Initial language from ?lang=fr | ?lang=en (defaults to en).
//   - In-form toggle lets the user switch.
//
// Styling matches the partner/contact form (teal labels, light inputs, pink
// pill button). Self-contained (scoped <style> + the same CSS variables) so it
// renders identically regardless of the host page's CSS — important in an iframe.

import { useEffect, useState } from "react";

const EDGE_FUNCTION_URL =
  "https://jheqxfkyxewofpnkbayc.supabase.co/functions/v1/submit-application";

type Lang = "en" | "fr";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Canonical (English) province names are sent as the value, matching the stores
// table convention; labels are localized.
const PROVINCES: { value: string; en: string; fr: string }[] = [
  { value: "Alberta", en: "Alberta", fr: "Alberta" },
  { value: "British Columbia", en: "British Columbia", fr: "Colombie-Britannique" },
  { value: "Manitoba", en: "Manitoba", fr: "Manitoba" },
  { value: "New Brunswick", en: "New Brunswick", fr: "Nouveau-Brunswick" },
  { value: "Newfoundland and Labrador", en: "Newfoundland and Labrador", fr: "Terre-Neuve-et-Labrador" },
  { value: "Nova Scotia", en: "Nova Scotia", fr: "Nouvelle-Écosse" },
  { value: "Northwest Territories", en: "Northwest Territories", fr: "Territoires du Nord-Ouest" },
  { value: "Nunavut", en: "Nunavut", fr: "Nunavut" },
  { value: "Ontario", en: "Ontario", fr: "Ontario" },
  { value: "Prince Edward Island", en: "Prince Edward Island", fr: "Île-du-Prince-Édouard" },
  { value: "Quebec", en: "Quebec", fr: "Québec" },
  { value: "Saskatchewan", en: "Saskatchewan", fr: "Saskatchewan" },
  { value: "Yukon", en: "Yukon", fr: "Yukon" },
];

const BUSINESS_TYPES: { value: string; en: string; fr: string }[] = [
  { value: "gas_station", en: "Gas Station", fr: "Station-service" },
  { value: "convenience_store", en: "Convenience Store", fr: "Dépanneur" },
  { value: "family_fun_centre", en: "Family Fun Centre", fr: "Centre de divertissement familial" },
  { value: "amusement_park", en: "Amusement Park", fr: "Parc d'attractions" },
  { value: "movie_theatre", en: "Movie Theatre", fr: "Cinéma" },
  { value: "ice_cream_shop", en: "Ice Cream Shop", fr: "Crèmerie" },
  { value: "other", en: "Other (please specify)", fr: "Autre (veuillez préciser)" },
];

const CUSTOMERS: { value: string; en: string; fr: string }[] = [
  { value: "under_200", en: "Under 200", fr: "Moins de 200" },
  { value: "200_499", en: "200–499", fr: "200–499" },
  { value: "500_999", en: "500–999", fr: "500–999" },
  { value: "1000_1499", en: "1,000–1,499", fr: "1 000–1 499" },
  { value: "1500_plus", en: "1,500+", fr: "1 500+" },
];

const PAYMENTS: { value: string; en: string; fr: string }[] = [
  { value: "pad_eft", en: "Pre-authorized debit / EFT", fr: "Débit préautorisé / TEF" },
  { value: "cheque", en: "Cheque", fr: "Chèque" },
  { value: "cash", en: "Cash", fr: "Comptant" },
  { value: "e_transfer", en: "e-Transfer", fr: "Virement Interac" },
  { value: "terms", en: "Invoice terms (Net 30)", fr: "Termes de facturation (Net 30)" },
];

const COPY = {
  en: {
    heading: "Apply for a Mini Melts account",
    intro:
      "Tell us about your business and we'll see if the Mini Melts freezer program is a fit. It takes about 3 minutes. Our team reviews every application and follows up by email.",
    switchTo: "Français",
    required: "required",
    optional: "optional",

    secBusiness: "Your business",
    secContact: "Your contact details",
    secLocation: "Store location",
    secFit: "Your space & traffic",
    secProgram: "Program",
    secPayment: "Payment",

    legalName: "Legal business name",
    operatingName: "Operating / DBA name (if different)",
    businessType: "Type of business",
    businessTypeOther: "Please describe your business",
    businessTypeChoose: "Choose one…",
    yearsInBusiness: "Years in business",
    numLocations: "Number of locations",

    firstName: "First name",
    lastName: "Last name",
    title: "Your role / title",
    email: "Email",
    phone: "Phone",

    addr1: "Street address",
    city: "City",
    province: "Province",
    provinceChoose: "Choose…",
    postal: "Postal code",

    freezerSpace:
      "Do you have room to place the freezer(s)? The ice cream freezer is about 3' × 2' and the sorbet freezer is about 2' × 2'.",
    power:
      "Do you have a power supply that can handle the freezer(s)? Each draws about 1.2 amps and plugs into a standard outlet.",
    customers: "About how many customers visit per day?",
    customersChoose: "Choose…",
    sellsNovelties: "Do you currently sell ice cream or frozen novelties?",
    sellsMonthly: "Roughly how much per month?",
    sellsMonthlyPh: "e.g. $500/month",
    seasonality: "Are you open year-round or seasonal?",

    programIntro: "Which program(s) are you interested in? Select one or both.",
    iceCream: "Ice cream freezer program",
    sorbet: "Sorbet freezer program",
    iceCreamTerms:
      "$2.89/cup · first order 352 cups, then 180/order · $3,000/year minimum · $20 delivery. Freezer provided free as long as the annual minimum is met (otherwise $50/month).",
    sorbetTerms:
      "$67.44/case (24 units, $2.81/unit) · first order 12 cases, then 6/order · $2,500/year minimum · $20 delivery. Freezer provided free as long as the annual minimum is met (otherwise $50/month).",
    commit:
      "Mini Melts provides the freezer at no charge as long as you meet the annual minimum for each program you join. If the minimum isn't met, a $50/month rental fee applies. Can you commit to this?",

    paymentPref: "Preferred payment method",
    paymentChoose: "Choose…",

    message: "Anything else we should know?",

    yes: "Yes",
    no: "No",
    notSure: "Not sure",
    yearRound: "Year-round",
    seasonal: "Seasonal",

    send: "Submit application",
    sending: "Submitting…",

    receivedTitle: "Application received!",
    receivedBody:
      "Thanks — our team will review your application and get back to you within a few business days.",
    declinedTitle: "Thanks for your interest",
    declinedBody:
      "Based on your responses, the freezer program isn't the right fit right now. If your situation changes, you're welcome to reach out to sales@minimelts.ca.",

    errName: "Please enter your first and last name.",
    errEmail: "Please enter a valid email address.",
    errPhone: "Please enter a phone number.",
    errLegal: "Please enter your legal business name.",
    errType: "Please choose a business type.",
    errTypeOther: "Please describe your business.",
    errAddress: "Please enter your full store address.",
    errProgram: "Please select at least one program.",
    errFreezer: "Please let us know about freezer space.",
    errCustomers: "Please tell us about how many customers visit per day.",
    errYears: "Please enter how many years you've been in business.",
    errLocations: "Please enter your number of locations.",
    errPostal: "Please enter your postal code.",
    errSells: "Please tell us whether you currently sell ice cream or frozen novelties.",
    errSeasonality: "Please tell us whether you're open year-round or seasonal.",
    errMonthly: "Please enter roughly how much you sell per month.",
    errPayment: "Please choose a preferred payment method.",
    errCommit: "Please answer the minimum-commitment question.",
    errGeneric:
      "Something went wrong submitting your application. Please try again, or email sales@minimelts.ca.",
  },
  fr: {
    heading: "Demande de compte Mini Melts",
    intro:
      "Parlez-nous de votre commerce et nous verrons si le programme de congélateurs Mini Melts vous convient. Cela prend environ 3 minutes. Notre équipe examine chaque demande et fait un suivi par courriel.",
    switchTo: "English",
    required: "requis",
    optional: "facultatif",

    secBusiness: "Votre commerce",
    secContact: "Vos coordonnées",
    secLocation: "Emplacement du magasin",
    secFit: "Votre espace et achalandage",
    secProgram: "Programme",
    secPayment: "Paiement",

    legalName: "Nom légal de l'entreprise",
    operatingName: "Nom commercial (si différent)",
    businessType: "Type de commerce",
    businessTypeOther: "Veuillez décrire votre commerce",
    businessTypeChoose: "Choisissez…",
    yearsInBusiness: "Années en activité",
    numLocations: "Nombre d'emplacements",

    firstName: "Prénom",
    lastName: "Nom",
    title: "Votre rôle / titre",
    email: "Courriel",
    phone: "Téléphone",

    addr1: "Adresse",
    city: "Ville",
    province: "Province",
    provinceChoose: "Choisissez…",
    postal: "Code postal",

    freezerSpace:
      "Avez-vous de la place pour le(s) congélateur(s) ? Le congélateur à crème glacée mesure environ 3' × 2' et celui à sorbet environ 2' × 2'.",
    power:
      "Avez-vous une alimentation électrique pouvant alimenter le(s) congélateur(s) ? Chacun consomme environ 1,2 ampère et se branche sur une prise standard.",
    customers: "Environ combien de clients vous visitent par jour ?",
    customersChoose: "Choisissez…",
    sellsNovelties: "Vendez-vous déjà de la crème glacée ou des friandises glacées ?",
    sellsMonthly: "Environ combien par mois ?",
    sellsMonthlyPh: "p. ex. 500 $/mois",
    seasonality: "Êtes-vous ouvert toute l'année ou de façon saisonnière ?",

    programIntro: "Quel(s) programme(s) vous intéresse(nt) ? Sélectionnez-en un ou les deux.",
    iceCream: "Programme de congélateur — crème glacée",
    sorbet: "Programme de congélateur — sorbet",
    iceCreamTerms:
      "2,89 $/coupe · première commande 352 coupes, puis 180/commande · minimum de 3 000 $/an · livraison 20 $. Congélateur fourni gratuitement tant que le minimum annuel est atteint (sinon 50 $/mois).",
    sorbetTerms:
      "67,44 $/caisse (24 unités, 2,81 $/unité) · première commande 12 caisses, puis 6/commande · minimum de 2 500 $/an · livraison 20 $. Congélateur fourni gratuitement tant que le minimum annuel est atteint (sinon 50 $/mois).",
    commit:
      "Mini Melts fournit le congélateur gratuitement tant que vous atteignez le minimum annuel de chaque programme. Si le minimum n'est pas atteint, des frais de location de 50 $/mois s'appliquent. Pouvez-vous vous y engager ?",

    paymentPref: "Mode de paiement préféré",
    paymentChoose: "Choisissez…",

    message: "Autre chose à nous dire ?",

    yes: "Oui",
    no: "Non",
    notSure: "Incertain",
    yearRound: "Toute l'année",
    seasonal: "Saisonnier",

    send: "Envoyer la demande",
    sending: "Envoi…",

    receivedTitle: "Demande reçue !",
    receivedBody:
      "Merci — notre équipe examinera votre demande et vous répondra d'ici quelques jours ouvrables.",
    declinedTitle: "Merci de votre intérêt",
    declinedBody:
      "D'après vos réponses, le programme de congélateurs ne convient pas pour le moment. Si votre situation change, n'hésitez pas à écrire à sales@minimelts.ca.",

    errName: "Veuillez entrer votre prénom et votre nom.",
    errEmail: "Veuillez entrer une adresse courriel valide.",
    errPhone: "Veuillez entrer un numéro de téléphone.",
    errLegal: "Veuillez entrer le nom légal de votre entreprise.",
    errType: "Veuillez choisir un type de commerce.",
    errTypeOther: "Veuillez décrire votre commerce.",
    errAddress: "Veuillez entrer l'adresse complète de votre magasin.",
    errProgram: "Veuillez sélectionner au moins un programme.",
    errFreezer: "Veuillez nous indiquer si vous avez de l'espace pour un congélateur.",
    errCustomers: "Veuillez indiquer environ combien de clients vous visitent par jour.",
    errYears: "Veuillez indiquer depuis combien d'années vous êtes en activité.",
    errLocations: "Veuillez indiquer votre nombre d'emplacements.",
    errPostal: "Veuillez entrer votre code postal.",
    errSells: "Veuillez indiquer si vous vendez déjà de la crème glacée ou des friandises glacées.",
    errSeasonality: "Veuillez indiquer si vous êtes ouvert toute l'année ou de façon saisonnière.",
    errMonthly: "Veuillez indiquer environ combien vous vendez par mois.",
    errPayment: "Veuillez choisir un mode de paiement préféré.",
    errCommit: "Veuillez répondre à la question sur l'engagement minimum.",
    errGeneric:
      "Une erreur est survenue lors de l'envoi de votre demande. Veuillez réessayer ou écrire à sales@minimelts.ca.",
  },
} as const;

type FormState = {
  firstName: string; lastName: string; applicantTitle: string; email: string; phone: string;
  legalName: string; operatingName: string; businessType: string; businessTypeOther: string;
  addr1: string; city: string; province: string; postal: string;
  yearsInBusiness: string; numLocations: string;
  hasFreezerSpace: string; hasPowerOutlet: string;
  customersPerDay: string; sellsNovelties: string; sellsNoveltiesMonthly: string; seasonality: string;
  wantsIceCream: boolean; wantsSorbet: boolean;
  commitsToMinimum: string; paymentPref: string; message: string;
};

const INITIAL: FormState = {
  firstName: "", lastName: "", applicantTitle: "", email: "", phone: "",
  legalName: "", operatingName: "", businessType: "", businessTypeOther: "",
  addr1: "", city: "", province: "", postal: "",
  yearsInBusiness: "", numLocations: "",
  hasFreezerSpace: "", hasPowerOutlet: "",
  customersPerDay: "", sellsNovelties: "", sellsNoveltiesMonthly: "", seasonality: "",
  wantsIceCream: false, wantsSorbet: false,
  commitsToMinimum: "", paymentPref: "", message: "",
};

export default function ApplicationForm() {
  const [lang, setLang] = useState<Lang>("en");
  const [f, setF] = useState<FormState>(INITIAL);
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "received" | "declined">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("lang");
    if (q === "fr" || q === "en") setLang(q);
  }, []);

  const t = COPY[lang];
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((p) => ({ ...p, [k]: v }));

  function validate(): string | null {
    if (f.firstName.trim().length < 1 || f.lastName.trim().length < 1) return t.errName;
    if (!EMAIL_RE.test(f.email.trim())) return t.errEmail;
    if (f.phone.trim().length < 1) return t.errPhone;
    if (f.legalName.trim().length < 1) return t.errLegal;
    if (!f.businessType) return t.errType;
    if (f.businessType === "other" && f.businessTypeOther.trim().length < 1) return t.errTypeOther;
    if (f.yearsInBusiness === "") return t.errYears;
    if (f.numLocations === "") return t.errLocations;
    if (!f.addr1.trim() || !f.city.trim() || !f.province) return t.errAddress;
    if (f.postal.trim().length < 1) return t.errPostal;
    if (!f.wantsIceCream && !f.wantsSorbet) return t.errProgram;
    if (!f.hasFreezerSpace) return t.errFreezer;
    if (!f.customersPerDay) return t.errCustomers;
    if (!f.sellsNovelties) return t.errSells;
    if (f.sellsNovelties === "yes" && f.sellsNoveltiesMonthly.trim().length < 1) return t.errMonthly;
    if (!f.seasonality) return t.errSeasonality;
    if (!f.paymentPref) return t.errPayment;
    if (!f.commitsToMinimum) return t.errCommit;
    return null;
  }

  async function handleSubmit() {
    setError(null);
    const err = validate();
    if (err) { setError(err); return; }

    setStatus("sending");
    try {
      const payload: Record<string, unknown> = {
        company_website: honeypot, // honeypot
        first_name: f.firstName.trim(),
        last_name: f.lastName.trim(),
        applicant_title: f.applicantTitle.trim() || undefined,
        email: f.email.trim(),
        phone: f.phone.trim(),
        legal_name: f.legalName.trim(),
        operating_name: f.operatingName.trim() || undefined,
        business_type: f.businessType,
        business_type_other: f.businessType === "other" ? f.businessTypeOther.trim() : undefined,
        addr1: f.addr1.trim(),
        city: f.city.trim(),
        province: f.province,
        postal: f.postal.trim() || undefined,
        years_in_business: f.yearsInBusiness ? Number(f.yearsInBusiness) : undefined,
        num_locations: f.numLocations ? Number(f.numLocations) : undefined,
        has_freezer_space: f.hasFreezerSpace || undefined,
        has_power_outlet: f.hasPowerOutlet || undefined,
        customers_per_day: f.customersPerDay || undefined,
        sells_novelties: f.sellsNovelties || undefined,
        sells_novelties_monthly: f.sellsNoveltiesMonthly.trim() || undefined,
        seasonality: f.seasonality || undefined,
        wants_ice_cream: f.wantsIceCream,
        wants_sorbet: f.wantsSorbet,
        commits_to_minimum: f.commitsToMinimum,
        payment_pref: f.paymentPref || undefined,
        message: f.message.trim() || undefined,
      };

      const res = await fetch(EDGE_FUNCTION_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setStatus("idle");
        setError(t.errGeneric);
        return;
      }
      setStatus(data.outcome === "declined" ? "declined" : "received");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (_e) {
      setStatus("idle");
      setError(t.errGeneric);
    }
  }

  // Reusable yes/no(/not-sure) segmented control
  const Seg = ({
    value, onChange, withNotSure = true,
  }: { value: string; onChange: (v: string) => void; withNotSure?: boolean }) => (
    <div className="mm-seg" role="group">
      <button type="button" className={`mm-seg-btn${value === "yes" ? " active" : ""}`} onClick={() => onChange("yes")}>{t.yes}</button>
      <button type="button" className={`mm-seg-btn${value === "no" ? " active" : ""}`} onClick={() => onChange("no")}>{t.no}</button>
      {withNotSure && (
        <button type="button" className={`mm-seg-btn${value === "not_sure" ? " active" : ""}`} onClick={() => onChange("not_sure")}>{t.notSure}</button>
      )}
    </div>
  );

  return (
    <div className="mm-wrap">
      <style>{`
        .mm-wrap {
          --teal: #34b3c4; --teal-dark: #2a93a1; --pink: #ef5a9c; --pink-dark: #e23f88;
          --ink: #3a4a52; --line: #d9dfe2; --muted: #9aa7ad;
          font-family: "Poppins", "Quicksand", "Trebuchet MS", system-ui, sans-serif;
          color: var(--ink); max-width: 640px; margin: 0 auto; padding: 28px 20px 48px; box-sizing: border-box;
        }
        .mm-wrap * { box-sizing: border-box; }
        .mm-topbar { display: flex; justify-content: flex-end; margin-bottom: 8px; }
        .mm-lang { background: none; border: none; cursor: pointer; color: var(--teal); font-weight: 600;
          font-size: 14px; font-family: inherit; padding: 6px 8px; border-radius: 8px; text-decoration: underline; text-underline-offset: 3px; }
        .mm-lang:hover { color: var(--teal-dark); }
        .mm-heading { color: var(--teal); font-size: 30px; line-height: 1.15; font-weight: 700; margin: 0 0 10px; }
        .mm-intro { font-size: 15px; line-height: 1.55; color: var(--ink); margin: 0 0 22px; }
        .mm-sect { color: var(--teal); font-size: 12px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
          margin: 30px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--line); }
        .mm-row { display: flex; gap: 16px; }
        .mm-row .mm-field { flex: 1; }
        @media (max-width: 480px) { .mm-row { flex-direction: column; gap: 0; } }
        .mm-field { margin-bottom: 18px; }
        .mm-label { display: block; color: var(--teal); font-size: 15px; font-weight: 600; margin-bottom: 7px; }
        .mm-label .mm-req { color: var(--muted); font-weight: 400; font-size: 13px; }
        .mm-help { font-size: 14px; line-height: 1.5; color: var(--ink); margin: 0 0 10px; }
        .mm-input, .mm-textarea, .mm-select {
          width: 100%; border: 1px solid var(--line); border-radius: 4px; background: #fafbfb;
          padding: 12px 13px; font-size: 15px; font-family: inherit; color: var(--ink);
          transition: border-color .15s, box-shadow .15s; }
        .mm-select { appearance: none; -webkit-appearance: none; background-image:
          url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'><path d='M1 1l5 5 5-5' fill='none' stroke='%239aa7ad' stroke-width='2' stroke-linecap='round'/></svg>");
          background-repeat: no-repeat; background-position: right 14px center; padding-right: 36px; }
        .mm-input:focus, .mm-textarea:focus, .mm-select:focus {
          outline: none; border-color: var(--teal); box-shadow: 0 0 0 3px rgba(52,179,196,.15); background: #fff; }
        .mm-textarea { min-height: 110px; resize: vertical; }
        .mm-honeypot { position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
        .mm-seg { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; overflow: hidden; background: #fafbfb; }
        .mm-seg-btn { border: none; background: none; cursor: pointer; font-family: inherit; font-size: 14px;
          font-weight: 600; color: var(--muted); padding: 9px 18px; transition: background .15s, color .15s; }
        .mm-seg-btn + .mm-seg-btn { border-left: 1px solid var(--line); }
        .mm-seg-btn.active { background: var(--teal); color: #fff; }
        .mm-prog { border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; margin-bottom: 14px;
          cursor: pointer; transition: border-color .15s, background .15s; }
        .mm-prog.active { border-color: var(--teal); background: rgba(52,179,196,.06); }
        .mm-prog-head { display: flex; align-items: center; gap: 10px; }
        .mm-prog-head input { width: 18px; height: 18px; accent-color: var(--teal); flex: none; }
        .mm-prog-title { font-weight: 600; color: var(--ink); font-size: 16px; }
        .mm-terms { font-size: 13px; line-height: 1.5; color: var(--muted); margin: 8px 0 0; padding-left: 28px; }
        .mm-btn { appearance: none; border: none; cursor: pointer; background: var(--pink); color: #fff;
          font-family: inherit; font-size: 17px; font-weight: 600; letter-spacing: .3px; padding: 15px 42px;
          border-radius: 999px; margin-top: 12px; box-shadow: 0 6px 18px rgba(239,90,156,.32);
          transition: background .15s, transform .08s, box-shadow .15s; }
        .mm-btn:hover:not(:disabled) { background: var(--pink-dark); box-shadow: 0 8px 22px rgba(239,90,156,.4); }
        .mm-btn:active:not(:disabled) { transform: translateY(1px); }
        .mm-btn:disabled { opacity: .65; cursor: default; }
        .mm-error { background: #fdeef3; border: 1px solid #f6c4d8; color: #b3245f; padding: 12px 14px;
          border-radius: 8px; font-size: 14px; margin-bottom: 18px; }
        .mm-success { text-align: center; padding: 44px 20px; }
        .mm-success-badge { width: 64px; height: 64px; border-radius: 50%; background: var(--teal); color: #fff;
          display: inline-flex; align-items: center; justify-content: center; font-size: 34px; margin-bottom: 18px;
          box-shadow: 0 8px 20px rgba(52,179,196,.3); animation: mm-pop .35s ease; }
        @keyframes mm-pop { from { transform: scale(.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .mm-success-title { color: var(--teal); font-size: 26px; font-weight: 700; margin: 0 0 10px; }
        .mm-success-body { font-size: 16px; line-height: 1.55; color: var(--ink); margin: 0 auto; max-width: 460px; }
      `}</style>

      {status === "received" || status === "declined" ? (
        <div className="mm-success" role="status" aria-live="polite">
          <div className="mm-success-badge">{status === "received" ? "✓" : "♥"}</div>
          <h2 className="mm-success-title">{status === "received" ? t.receivedTitle : t.declinedTitle}</h2>
          <p className="mm-success-body">{status === "received" ? t.receivedBody : t.declinedBody}</p>
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

          {/* ── Business ── */}
          <div className="mm-sect">{t.secBusiness}</div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="legal">{t.legalName} <span className="mm-req">({t.required})</span></label>
            <input id="legal" className="mm-input" type="text" maxLength={200}
              value={f.legalName} onChange={(e) => set("legalName", e.target.value)} />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="operating">{t.operatingName} <span className="mm-req">({t.optional})</span></label>
            <input id="operating" className="mm-input" type="text" maxLength={200}
              value={f.operatingName} onChange={(e) => set("operatingName", e.target.value)} />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="btype">{t.businessType} <span className="mm-req">({t.required})</span></label>
            <select id="btype" className="mm-select" value={f.businessType} onChange={(e) => set("businessType", e.target.value)}>
              <option value="">{t.businessTypeChoose}</option>
              {BUSINESS_TYPES.map((b) => <option key={b.value} value={b.value}>{b[lang]}</option>)}
            </select>
          </div>

          {f.businessType === "other" && (
            <div className="mm-field">
              <label className="mm-label" htmlFor="btype-other">{t.businessTypeOther} <span className="mm-req">({t.required})</span></label>
              <input id="btype-other" className="mm-input" type="text" maxLength={200}
                value={f.businessTypeOther} onChange={(e) => set("businessTypeOther", e.target.value)} />
            </div>
          )}

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="years">{t.yearsInBusiness} <span className="mm-req">({t.required})</span></label>
              <input id="years" className="mm-input" type="number" min={0} max={200} inputMode="numeric"
                value={f.yearsInBusiness} onChange={(e) => set("yearsInBusiness", e.target.value)} />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="locs">{t.numLocations} <span className="mm-req">({t.required})</span></label>
              <input id="locs" className="mm-input" type="number" min={0} max={1000} inputMode="numeric"
                value={f.numLocations} onChange={(e) => set("numLocations", e.target.value)} />
            </div>
          </div>

          {/* ── Contact ── */}
          <div className="mm-sect">{t.secContact}</div>

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="first">{t.firstName} <span className="mm-req">({t.required})</span></label>
              <input id="first" className="mm-input" type="text" autoComplete="given-name" maxLength={100}
                value={f.firstName} onChange={(e) => set("firstName", e.target.value)} />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="last">{t.lastName} <span className="mm-req">({t.required})</span></label>
              <input id="last" className="mm-input" type="text" autoComplete="family-name" maxLength={100}
                value={f.lastName} onChange={(e) => set("lastName", e.target.value)} />
            </div>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="title">{t.title} <span className="mm-req">({t.optional})</span></label>
            <input id="title" className="mm-input" type="text" maxLength={120}
              value={f.applicantTitle} onChange={(e) => set("applicantTitle", e.target.value)} />
          </div>

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="email">{t.email} <span className="mm-req">({t.required})</span></label>
              <input id="email" className="mm-input" type="email" autoComplete="email" maxLength={320}
                value={f.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="phone">{t.phone} <span className="mm-req">({t.required})</span></label>
              <input id="phone" className="mm-input" type="tel" autoComplete="tel" maxLength={40}
                value={f.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
          </div>

          {/* ── Location ── */}
          <div className="mm-sect">{t.secLocation}</div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="addr1">{t.addr1} <span className="mm-req">({t.required})</span></label>
            <input id="addr1" className="mm-input" type="text" autoComplete="address-line1" maxLength={250}
              value={f.addr1} onChange={(e) => set("addr1", e.target.value)} />
          </div>

          <div className="mm-row">
            <div className="mm-field">
              <label className="mm-label" htmlFor="city">{t.city} <span className="mm-req">({t.required})</span></label>
              <input id="city" className="mm-input" type="text" autoComplete="address-level2" maxLength={120}
                value={f.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div className="mm-field">
              <label className="mm-label" htmlFor="prov">{t.province} <span className="mm-req">({t.required})</span></label>
              <select id="prov" className="mm-select" value={f.province} onChange={(e) => set("province", e.target.value)}>
                <option value="">{t.provinceChoose}</option>
                {PROVINCES.map((p) => <option key={p.value} value={p.value}>{p[lang]}</option>)}
              </select>
            </div>
          </div>

          <div className="mm-field" style={{ maxWidth: 220 }}>
            <label className="mm-label" htmlFor="postal">{t.postal} <span className="mm-req">({t.required})</span></label>
            <input id="postal" className="mm-input" type="text" autoComplete="postal-code" maxLength={20}
              value={f.postal} onChange={(e) => set("postal", e.target.value)} />
          </div>

          {/* ── Fit ── */}
          <div className="mm-sect">{t.secFit}</div>

          <div className="mm-field">
            <p className="mm-help">{t.freezerSpace} <span className="mm-req">({t.required})</span></p>
            <Seg value={f.hasFreezerSpace} onChange={(v) => set("hasFreezerSpace", v)} />
          </div>

          <div className="mm-field">
            <p className="mm-help">{t.power} <span className="mm-req">({t.optional})</span></p>
            <Seg value={f.hasPowerOutlet} onChange={(v) => set("hasPowerOutlet", v)} />
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="cust">{t.customers} <span className="mm-req">({t.required})</span></label>
            <select id="cust" className="mm-select" value={f.customersPerDay} onChange={(e) => set("customersPerDay", e.target.value)}>
              <option value="">{t.customersChoose}</option>
              {CUSTOMERS.map((c) => <option key={c.value} value={c.value}>{c[lang]}</option>)}
            </select>
          </div>

          <div className="mm-field">
            <p className="mm-help">{t.sellsNovelties} <span className="mm-req">({t.required})</span></p>
            <Seg value={f.sellsNovelties} onChange={(v) => set("sellsNovelties", v)} withNotSure={false} />
          </div>

          {f.sellsNovelties === "yes" && (
            <div className="mm-field" style={{ maxWidth: 260 }}>
              <label className="mm-label" htmlFor="monthly">{t.sellsMonthly} <span className="mm-req">({t.required})</span></label>
              <input id="monthly" className="mm-input" type="text" maxLength={60} placeholder={t.sellsMonthlyPh}
                value={f.sellsNoveltiesMonthly} onChange={(e) => set("sellsNoveltiesMonthly", e.target.value)} />
            </div>
          )}

          <div className="mm-field">
            <p className="mm-help">{t.seasonality} <span className="mm-req">({t.required})</span></p>
            <div className="mm-seg" role="group">
              <button type="button" className={`mm-seg-btn${f.seasonality === "year_round" ? " active" : ""}`} onClick={() => set("seasonality", "year_round")}>{t.yearRound}</button>
              <button type="button" className={`mm-seg-btn${f.seasonality === "seasonal" ? " active" : ""}`} onClick={() => set("seasonality", "seasonal")}>{t.seasonal}</button>
            </div>
          </div>

          {/* ── Program ── */}
          <div className="mm-sect">{t.secProgram}</div>
          <p className="mm-help">{t.programIntro} <span className="mm-req">({t.required})</span></p>

          <div className={`mm-prog${f.wantsIceCream ? " active" : ""}`} onClick={() => set("wantsIceCream", !f.wantsIceCream)}>
            <div className="mm-prog-head">
              <input type="checkbox" checked={f.wantsIceCream} onChange={(e) => set("wantsIceCream", e.target.checked)} onClick={(e) => e.stopPropagation()} />
              <span className="mm-prog-title">{t.iceCream}</span>
            </div>
            <p className="mm-terms">{t.iceCreamTerms}</p>
          </div>

          <div className={`mm-prog${f.wantsSorbet ? " active" : ""}`} onClick={() => set("wantsSorbet", !f.wantsSorbet)}>
            <div className="mm-prog-head">
              <input type="checkbox" checked={f.wantsSorbet} onChange={(e) => set("wantsSorbet", e.target.checked)} onClick={(e) => e.stopPropagation()} />
              <span className="mm-prog-title">{t.sorbet}</span>
            </div>
            <p className="mm-terms">{t.sorbetTerms}</p>
          </div>

          <div className="mm-field" style={{ marginTop: 18 }}>
            <p className="mm-help">{t.commit} <span className="mm-req">({t.required})</span></p>
            <Seg value={f.commitsToMinimum} onChange={(v) => set("commitsToMinimum", v)} withNotSure={false} />
          </div>

          {/* ── Payment ── */}
          <div className="mm-sect">{t.secPayment}</div>
          <div className="mm-field">
            <label className="mm-label" htmlFor="pay">{t.paymentPref} <span className="mm-req">({t.required})</span></label>
            <select id="pay" className="mm-select" value={f.paymentPref} onChange={(e) => set("paymentPref", e.target.value)}>
              <option value="">{t.paymentChoose}</option>
              {PAYMENTS.map((p) => <option key={p.value} value={p.value}>{p[lang]}</option>)}
            </select>
          </div>

          <div className="mm-field">
            <label className="mm-label" htmlFor="msg">{t.message} <span className="mm-req">({t.optional})</span></label>
            <textarea id="msg" className="mm-textarea" maxLength={5000}
              value={f.message} onChange={(e) => set("message", e.target.value)} />
          </div>

          {/* Honeypot */}
          <div className="mm-honeypot" aria-hidden="true">
            <label htmlFor="company_website">Company website</label>
            <input id="company_website" name="company_website" type="text" tabIndex={-1} autoComplete="off"
              value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </div>

          <button type="button" className="mm-btn" onClick={handleSubmit} disabled={status === "sending"}>
            {status === "sending" ? t.sending : t.send}
          </button>
        </>
      )}
    </div>
  );
}
