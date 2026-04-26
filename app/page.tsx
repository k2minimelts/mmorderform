import OrderForm from "./OrderForm";

// Force dynamic rendering — don't pre-render at build time.
// The form uses useSearchParams and touches Supabase env vars,
// so static generation isn't appropriate here.
export const dynamic = "force-dynamic";

export default function Page() {
  return <OrderForm />;
}
