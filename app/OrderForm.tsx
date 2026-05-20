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
  SorbetStockLevel,
} from "@/lib/supabase";
import {
  EmailLookupView,
  EmailPickerView,
  NotACustomerView,
} from "./EmailLookupViews";

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
  { value: "empty", en: "Empty", fr: "Vide", icon: "\u{1F4ED}" },
  { value: "almost_empty", en: "Almost empty", fr: "Presque vide", icon: "\u{1F4E6}" },
  { value: "half", en: "Half full", fr: "Moiti\u00E9 pleine", icon: "\u{1F5C4}\u{FE0F}" },
  { value: "three_quarter", en: "3/4 full", fr: "3/4 pleine", icon: "\u{1F5C3}\u{FE0F}" },
];

// Sorbet stock options: same 4 levels as ice cream PLUS "own_freezer" for
// customers who sell sorbet from their existing freezer (no Mini Melts sorbet
// freezer at the store).
const SORBET_STOCK_OPTIONS: { value: SorbetStockLevel; en: string; fr: string; icon: string }[] = [
  { value: "empty", en: "Empty", fr: "Vide", icon: "\u{1F4ED}" },
  { value: "almost_empty", en: "Almost empty", fr: "Presque vide", icon: "\u{1F4E6}" },
  { value: "half", en: "Half full", fr: "Moiti\u00E9 pleine", icon: "\u{1F5C4}\u{FE0F}" },
  { value: "three_quarter", en: "3/4 full", fr: "3/4 pleine", icon: "\u{1F5C3}\u{FE0F}" },
  { value: "own_freezer", en: "I use my own freezer", fr: "J\u2019utilise mon propre cong\u00E9lateur", icon: "\u{1F9CA}" },
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
  const [includesSorbet, setIncludesSorbet] = useState<boolean>(false);
  const [sorbetStockLevel, setSorbetStockLevel] = useState<SorbetStockLevel | null>(null);
  const [notes, setNotes] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  function applyStoreToForm(result: StorePublicInfo) {
    setStore(result);
    const name = [result.first_name, result.last_name].filter(Boolean).join(" ");
    setContactName(name);
    setContactPhone(result.phone || "");
    setContactEmail(result.email || "");
  }

  useEffect(() => {
    if (codeParam) {
      (async () => {
        const
