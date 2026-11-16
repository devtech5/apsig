import { Icone } from "./Icone";
import { Plaque, Telephone } from "./Illustrations";

const ATOUTS = ["Centrale APSIG 24h/24", "Aucune application pour le témoin", "Adresse vérifiée au GPS"];

export function Hero() {
  return (
    <section id="haut" className="trame relative overflow-hidden bg-marine text-white">
      {/* Halo rouge du signal, derrière les visuels. */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-32 top-10 size-[36rem] rounded-full bg-signal/25 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-orange/10 blur-3xl" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20 lg:pb-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold tracking-wide ring-1 ring-white/15">
            <span className="relative flex size-2">
              <span className="onde absolute inline-flex size-full rounded-full bg-signal" />
              <span className="relative inline-flex size-2 rounded-full bg-signal" />
            </span>
            Service de mise en relation d'urgence · Côte d'Ivoire
          </p>
          <h1 className="mt-6 font-titre text-[2.6rem] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-6xl lg:text-[4.2rem]">
            Une alerte.
            <br />
            <span className="text-white/55">La bonne personne</span>
            <br />
            prévenue<span className="text-signal">.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/80">
            Un QR code sur votre portail, dans votre maison, au poignet de votre enfant. Un témoin le scanne avec son téléphone : la centrale APSIG
            vérifie, rappelle et met en relation votre famille et les secours.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="#rappel"
              className="inline-flex items-center gap-2 rounded-full bg-signal px-6 py-3.5 font-bold shadow-[0_14px_30px_-12px_rgb(200_16_46_/_0.9)] transition hover:-translate-y-0.5 hover:bg-[#a90d26] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Protéger mon foyer <Icone nom="fleche" className="size-4" />
            </a>
            <a
              href="#fonctionnement"
              className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-bold ring-1 ring-white/30 transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Voir comment ça marche
            </a>
          </div>
          <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/75">
            {ATOUTS.map((a) => (
              <li key={a} className="flex items-center gap-2">
                <Icone nom="check" className="size-4 text-vert" /> {a}
              </li>
            ))}
          </ul>
        </div>

        {/* Plaque scannée, puis l'écran qui s'ouvre chez le témoin. */}
        <div className="relative mx-auto h-[36rem] w-full max-w-[22rem] sm:max-w-lg">
          <Telephone className="absolute top-0 right-0 rotate-3" />
          <Plaque className="absolute bottom-0 left-0 z-10 w-48 -rotate-6 sm:w-56" />
        </div>
      </div>
    </section>
  );
}
