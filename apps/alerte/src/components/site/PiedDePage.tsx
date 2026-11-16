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
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 text-sm sm:px-6">
          <p className="font-bold">Urgence vitale ? Appelez d'abord :</p>
          {NUMEROS.map((n) => (
            <a key={n.numero} href={`tel:${n.numero}`} className="inline-flex items-center gap-1.5 font-semibold hover:underline">
              <Icone nom="telephone" className="size-4" /> {n.service} <span className="font-mono font-bold">{n.numero}</span>
            </a>
          ))}
        </div>
      </div>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
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
