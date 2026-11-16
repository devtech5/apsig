import { Icone, type NomIcone } from "./Icone";
import { QrDecoratif } from "./Illustrations";

type Support = { nom: string; usage: string; detail: string; icone: NomIcone; inclus: boolean };

// Forfait de lancement : plaque portail et QR intérieur. Les autres supports viendront en option.
const SUPPORTS: Support[] = [
  { nom: "Plaque portail", usage: "Sécurité · dissuasion", detail: "Aluminium anti-UV, rivetée. Seulement un code et le QR : aucun nom, aucune adresse.", icone: "maison", inclus: true },
  { nom: "QR intérieur", usage: "Santé · assistance", detail: "Petit format pour l'intérieur : la famille, l'aide à domicile ou un visiteur alerte en cas de malaise.", icone: "coeur", inclus: true },
  { nom: "Bracelet enfant", usage: "Enfant égaré", detail: "Au poignet : le passant qui le scanne partage sa position avec la centrale.", icone: "enfant", inclus: false },
  { nom: "Carte voyageur", usage: "En déplacement", detail: "Dans le portefeuille : utile loin de chez soi, quand personne ne vous connaît.", icone: "avion", inclus: false },
  { nom: "Carte véhicule", usage: "Sur la route", detail: "Dans la voiture : en cas d'accident, le témoin alerte sans connaître le conducteur.", icone: "voiture", inclus: false },
];

export function Supports() {
  const [plaque, interieur, ...options] = SUPPORTS;
  return (
    <section id="supports" aria-labelledby="titre-supports" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
      <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">Les supports</p>
      <div className="mt-3 grid gap-6 lg:grid-cols-2 lg:items-end">
        <h2 id="titre-supports" className="font-titre text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">Un QR code là où l'urgence peut arriver.</h2>
        <p className="text-lg leading-relaxed text-attenue">
          Chaque QR code ne contient qu'un identifiant opaque. Celui qui le scanne voit le type de support et le quartier, jamais votre nom ni votre
          numéro.
        </p>
      </div>

      <div className="mt-12 grid gap-4 lg:grid-cols-6">
        {/* Les deux supports du forfait, mis en avant. */}
        {[plaque!, interieur!].map((s, i) => (
          <article key={s.nom} className={`relative overflow-hidden rounded-3xl p-7 lg:col-span-3 ${i === 0 ? "bg-marine text-white" : "bg-white ring-1 ring-ligne"}`}>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${i === 0 ? "bg-white/15" : "bg-vert-clair text-vert"}`}>
              <Icone nom="check" className="size-3.5" /> Inclus dans le forfait
            </span>
            <h3 className="mt-5 font-titre text-2xl font-extrabold">{s.nom}</h3>
            <p className={`text-sm font-semibold ${i === 0 ? "text-white/60" : "text-signal"}`}>{s.usage}</p>
            <p className={`mt-3 max-w-sm leading-relaxed ${i === 0 ? "text-white/80" : "text-attenue"}`}>{s.detail}</p>
            <QrDecoratif className={`absolute -right-6 -bottom-6 w-36 rotate-12 rounded-xl opacity-90 ${i === 0 ? "text-marine" : "text-nuit"}`} />
          </article>
        ))}
        {options.map((s) => (
          <article key={s.nom} className="rounded-3xl border border-dashed border-ligne bg-white/60 p-6 lg:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <span className="grid size-11 place-items-center rounded-xl bg-brand-clair text-brand">
                <Icone nom={s.icone} className="size-5" />
              </span>
              <span className="rounded-full bg-sable px-2.5 py-1 text-xs font-bold text-attenue">Bientôt en option</span>
            </div>
            <h3 className="mt-4 font-titre text-lg font-bold">{s.nom}</h3>
            <p className="text-sm font-semibold text-signal">{s.usage}</p>
            <p className="mt-2 text-sm leading-relaxed text-attenue">{s.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
