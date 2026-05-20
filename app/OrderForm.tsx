function LookupView(props: LookupViewProps) {
  const { codeInput, setCodeInput, onSubmit, onSwitchToEmail, errorMsg } = props;
  return (
    <div className="max-w-md mx-auto px-4">
      <Brand />

      {/* Launch banner — TODO: remove or simplify after ~2026-07-15 once
          existing customers are familiar with the new ordering site. */}
      <div className="bg-gradient-to-br from-pink-50 to-teal-50 border border-pink-100 rounded-xl p-4 mt-4 text-center">
        <div className="text-sm font-bold text-gray-900 mb-1">
          {"\u{1F389}"} Welcome to the new Mini Melts Canada ordering site!
        </div>
        <div className="text-xs text-gray-600">
          Bienvenue sur le nouveau site de commande Mini Melts Canada&nbsp;!
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
        <h1 className="text-xl font-bold text-gray-900 mb-1">
          Enter your store code
        </h1>
        <div className="text-sm text-gray-500 mb-4">
          Entrez le code de votre magasin
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Your code looks like <span className="font-mono font-bold">ST-1234</span>. If you don&apos;t know it, use the link below to look it up by email. <br />
          <span className="text-gray-500">Votre code ressemble &agrave; <span className="font-mono font-bold">ST-1234</span>. Si vous ne le connaissez pas, retrouvez-le par courriel ci-dessous.</span>
        </p>
        <input
          type="text"
          placeholder="ST-1234"
