{/* Sorbet: only offered to enrolled stores (separate -18°C freezer).
            Non-enrolled stores get an explainer + application link instead. */}
        {sorbetEnrolled ? (
          <>
            <div className="border-t border-gray-200 pt-5 mb-5">
              <h2 className="text-base font-bold text-gray-900 mb-1">
                {"\u{1F368}"} Are you also ordering Mini Melts BIG Sorbet?
              </h2>
              <div className="text-sm text-gray-500 mb-3">
                Commandez-vous aussi du sorbet Mini Melts BIG?
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setIncludesSorbet(false)}
                  className={"rounded-xl p-3 border-2 transition text-center font-semibold " + (!includesSorbet ? "border-brand-pink bg-pink-50 text-gray-900" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")}
                >No / Non</button>
                <button
                  onClick={() => setIncludesSorbet(true)}
                  className={"rounded-xl p-3 border-2 transition text-center font-semibold " + (includesSorbet ? "border-brand-pink bg-pink-50 text-gray-900" : "border-gray-200 bg-white text-gray-600 hover:border-gray-300")}
                >Yes / Oui</button>
              </div>
            </div>
            {includesSorbet && (
              <div className="mb-5">
                <h2 className="text-base font-bold text-gray-900 mb-1">
                  How much sorbet stock do you have?
                </h2>
                <div className="text-sm text-gray-500 mb-3">
                  Quel est votre stock de sorbet?
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {SORBET_STOCK_OPTIONS.map((opt) => {
                    const selected = sorbetStockLevel === opt.value;
                    const isFullWidth = opt.value === "own_freezer";
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setSorbetStockLevel(opt.value)}
                        className={"rounded-xl p-4 border-2 transition text-left " + (isFullWidth ? "col-span-2 " : "") + (selected ? "border-brand-pink bg-pink-50" : "border-gray-200 bg-white hover:border-gray-300")}
                      >
                        <div className="text-3xl mb-2">{opt.icon}</div>
                        <div className="font-semibold text-gray-900 text-sm">{opt.en}</div>
                        <div className="text-xs text-gray-500">{opt.fr}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="border-t border-gray-200 pt-5 mb-5">
            <div className="rounded-xl border-2 border-pink-100 bg-pink-50/60 p-4">
              <h2 className="text-base font-bold text-gray-900 mb-1">
                {"\u{1F368}"} Interested in adding sorbet?
              </h2>
              <div className="text-sm text-gray-500 mb-2">
                Vous aimeriez ajouter du sorbet?
              </div>
              <p className="text-sm text-gray-700 mb-1">
                Mini Melts BIG Sorbet is stored in its own <strong>&minus;18&deg;C</strong> freezer &mdash; it can&apos;t go in your <strong>&minus;35&deg;C</strong> Mini Melts freezer, so it needs a separate freezer and a quick sign&#8209;up first.
              </p>
              <p className="text-xs text-gray-500 mb-3">
                Le sorbet est conserv&eacute; dans son propre cong&eacute;lateur &agrave; &minus;18&nbsp;&deg;C &mdash; il ne peut pas aller dans votre cong&eacute;lateur Mini Melts &agrave; &minus;35&nbsp;&deg;C. Un cong&eacute;lateur s&eacute;par&eacute; et une inscription sont requis.
              </p>
              
                href={`${SORBET_APPLICATION_URL}&store=${encodeURIComponent(storeCode)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-brand-pink text-white font-semibold px-4 py-2.5 rounded-lg hover:opacity-90 active:opacity-80 transition text-sm"
              >
                Apply for sorbet / Demander le sorbet &rarr;
              </a>
              <p className="text-xs text-gray-400 mt-2">
                You can still place your ice cream order below.
              </p>
            </div>
          </div>
        )}
