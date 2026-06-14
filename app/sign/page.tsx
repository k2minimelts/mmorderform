import SignPage from "../../sign-page";

export default function Page({ params }: { params: { token: string } }) {
  return <SignPage token={params.token} />;
}
