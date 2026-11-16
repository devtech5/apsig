import { Icone } from "./Icone";

const NUMEROS = [
  { numero: "170", service: "Police" },
  { numero: "180", service: "Pompiers" },
  { numero: "185", service: "SAMU" },
] as const;

export function PiedDePage() {
  return (
    <footer className="bg-nuit text-white">
      {/* Rappel permanent : le service facilite la transmission, il ne remplace pas les numéros publics. */}
      <div className="border-b border-white/10 bg-signal">
        <div className="mx-auto grid max-w-6xl gap-3 px-4 py-4 sm:flex sm:flex-wrap sm:items-center sm:gap-x-6 sm:px-6">
          <p className="text-center text-sm font-bold sm:text-left">Urgence vitale ? Appelez d'abord :</p>
          <ul className="grid grid-cols-3 gap-2 sm:flex sm:gap-6">
            {NUMEROS.map((n) => (
              <li key={n.numero}>
                <a
                  href={`tel:${n.numero}`}
                  className="grid justify-items-center gap-0.5 rounded-xl bg-white/15 px-2 py-2 ring-1 ring-white/25 hover:bg-white/25 sm:inline-flex sm:items-center sm:gap-1.5 sm:bg-transparent sm:p-0 sm:ring-0 sm:hover:bg-transparent sm:hover:underline"
                >
                  <span className="flex items-center gap-1.5 font-mono text-lg font-bold sm:order-2 sm:text-sm">
                    <Icone nom="telephone" className="size-4 sm:hidden" />
                    {n.numero}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold sm:order-1 sm:text-sm">
                    <Icone nom="telephone" className="hidden size-4 sm:block" />
                    {n.service}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-4 py-10 sm:px-6 sm:py-12 md:grid-cols-[1.4fr_1fr_1fr] md:gap-10">
        <div className="col-span-2 md:col-span-1">
          <div className="flex items-center gap-2.5">
            <img src="/logo-apsig.svg" alt="" width={32} height={36} className="h-9 w-8" />
            <span className="leading-tight">
              <span className="block font-titre text-lg font-extrabold">APSIG</span>
              <span className="block text-xs text-white/60">Agence de Protection et de Sécurité Intégrée du Golfe</span>
            </span>
          </div>
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-white/60">
            CODE-SECOURS CI est un service de mise en relation. Il facilite la transmission de l'alerte vers la famille et les secours, et ne remplace
            pas les numéros d'urgence publics.
          </p>
        </div>
        <nav aria-label="Le service" className="grid content-start gap-2 text-sm">
          <p className="mb-1 font-bold text-white/90">Le service</p>
          {[["#fonctionnement", "Comment ça marche"], ["#supports", "Les supports"], ["#tarifs", "Tarifs"], ["#questions", "Questions fréquentes"]].map(([h, l]) => (
            <a key={h} href={h} className="text-white/60 hover:text-white">
              {l}
            </a>
          ))}
        </nav>
        <nav aria-label="Accès" className="grid content-start gap-2 text-sm">
          <p className="mb-1 font-bold text-white/90">Accès</p>
          <a href="#rappel" className="text-white/60 hover:text-white">
            Être rappelé
          </a>
          <a href="https://op.apsig.online" className="text-white/60 hover:text-white">
            Espace équipes terrain
          </a>
        </nav>
      </div>
      <p className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/40">© {new Date().getFullYear()} APSIG · CODE-SECOURS CI</p>
    </footer>
  );
}
