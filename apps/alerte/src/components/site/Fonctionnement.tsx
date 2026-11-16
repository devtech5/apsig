import { Icone, type NomIcone } from "./Icone";

const SCENARIOS: { titre: string; texte: string; icone: NomIcone; teinte: string }[] = [
  { titre: "Un enfant s'égare", texte: "Un passant scanne son bracelet : la famille est prévenue, la position du témoin transmise.", icone: "enfant", teinte: "bg-[#efe6fb] text-[#7e22ce]" },
  { titre: "Un parent fait un malaise", texte: "La personne présente scanne le QR intérieur : la centrale rappelle et oriente vers les secours.", icone: "coeur", teinte: "bg-orange-clair text-orange" },
  { titre: "Une intrusion la nuit", texte: "Un voisin scanne la plaque du portail : l'adresse est connue au mètre près, la famille alertée.", icone: "bouclier", teinte: "bg-signal-clair text-signal" },
];

const ETAPES: { titre: string; texte: string; icone: NomIcone }[] = [
  { titre: "Le témoin scanne", texte: "Avec l'appareil photo de n'importe quel téléphone. Aucune application à installer, aucun compte.", icone: "qr" },
  { titre: "Il choisit l'urgence", texte: "Agression, malaise, incendie, enfant égaré… Sa position est partagée s'il l'accepte.", icone: "repere" },
  { titre: "La centrale vérifie", texte: "Un opérateur APSIG reçoit l'alerte, rappelle le témoin et le titulaire, et qualifie la situation.", icone: "casque" },
  { titre: "Les bonnes personnes agissent", texte: "Votre famille est prévenue et les services de secours sont mis en relation, selon l'urgence.", icone: "famille" },
];

export function Scenarios() {
  return (
    <section aria-labelledby="titre-scenarios" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="grid gap-5 sm:gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
        <h2 id="titre-scenarios" className="font-titre text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-5xl">
          Quand chaque minute compte, le premier témoin ne sait pas qui appeler.
        </h2>
        <p className="text-lg leading-relaxed text-attenue">
          Il ne connaît ni votre nom ni le numéro de vos proches. Avec CODE-SECOURS CI, il n'a besoin de rien savoir : le QR code fait le lien avec la
          centrale APSIG, qui sait qui prévenir.
        </p>
      </div>
      <ul className="mt-8 grid gap-3 sm:mt-12 sm:gap-4 md:grid-cols-3">
        {SCENARIOS.map((s) => (
          <li
            key={s.titre}
            className="grid grid-cols-[auto_1fr] gap-4 rounded-3xl border border-ligne bg-white p-5 transition hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgb(11_26_58_/_0.35)] sm:p-6 md:block"
          >
            <span className={`grid size-12 place-items-center rounded-2xl ${s.teinte}`}>
              <Icone nom={s.icone} className="size-6" />
            </span>
            <div>
              <h3 className="font-titre text-lg font-bold sm:text-xl md:mt-5">{s.titre}</h3>
              <p className="mt-1 leading-relaxed text-attenue sm:mt-2">{s.texte}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Etapes() {
  return (
    <section id="fonctionnement" aria-labelledby="titre-etapes" className="scroll-mt-20 bg-sable/60">
      <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
        <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">Comment ça marche</p>
        <h2 id="titre-etapes" className="mt-3 max-w-2xl font-titre text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">
          Du scan à la mise en relation, en quatre temps.
        </h2>
        <ol className="mt-10 grid gap-7 sm:mt-14 sm:gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-6">
          {ETAPES.map((e, i) => (
            <li key={e.titre} className="relative grid grid-cols-[auto_1fr] gap-4 md:block">
              {i < ETAPES.length - 1 && <span aria-hidden="true" className="absolute top-7 left-16 hidden h-px w-[calc(100%-3rem)] bg-gradient-to-r from-brand/40 to-transparent lg:block" />}
              {/* Mobile : fil vertical entre les étapes. */}
              {i < ETAPES.length - 1 && <span aria-hidden="true" className="absolute top-14 bottom-[-1.75rem] left-[1.375rem] w-px bg-brand/20 md:hidden" />}
              <div className="flex items-center gap-3">
                <span className="relative grid size-11 place-items-center rounded-2xl bg-marine text-white shadow-[0_12px_24px_-12px_rgb(18_40_90_/_0.8)] md:size-14">
                  <Icone nom={e.icone} className="size-5 md:size-6" />
                </span>
                <span className="hidden font-titre text-5xl font-extrabold text-brand/15 md:inline">{String(i + 1).padStart(2, "0")}</span>
              </div>
              <div>
                <h3 className="font-titre text-lg font-bold sm:text-xl md:mt-5">
                  <span className="mr-2 text-brand/40 md:hidden">{String(i + 1).padStart(2, "0")}</span>
                  {e.titre}
                </h3>
                <p className="mt-1 leading-relaxed text-attenue md:mt-2">{e.texte}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-10 flex items-start gap-3 sm:mt-12 rounded-2xl bg-white/70 p-4 text-sm leading-relaxed text-attenue ring-1 ring-ligne">
          <Icone nom="check" className="mt-0.5 size-5 shrink-0 text-vert" />
          Erreur de manipulation ? Le témoin annule en un appui tant qu'aucune équipe n'est sur place. Et une alerte n'est jamais refusée pour un
          abonnement expiré.
        </p>
      </div>
    </section>
  );
}
