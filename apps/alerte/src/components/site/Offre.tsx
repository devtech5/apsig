import { CIBLES, FORFAIT_UNIQUE, MENSUALITES_FCFA, type Cible } from "@apsig/domain";
import { Icone, type NomIcone } from "./Icone";

export const francs = (n: number) => `${n.toLocaleString("fr-FR").replace(/\s/g, " ")} F`;

const CENTRALE: { titre: string; texte: string; icone: NomIcone }[] = [
  { titre: "Des opérateurs 24h/24", texte: "Chaque alerte est attribuée à un opérateur en service, qui la prend en charge et la suit jusqu'au bout.", icone: "horloge" },
  { titre: "Une carte en temps réel", texte: "Adresse vérifiée au GPS lors de la pose de la plaque, position du témoin suivie en direct.", icone: "repere" },
  { titre: "Les bons interlocuteurs", texte: "Titulaire, proches, et selon l'urgence Police, GSPM, SAMU ou ambulance privée.", icone: "famille" },
  { titre: "Chaque action tracée", texte: "Prise en charge, rappels, mise en relation : tout est inscrit au journal de l'alerte.", icone: "verrou" },
];

const GARANTIES: { titre: string; texte: string }[] = [
  { titre: "Aucun nom sur vos supports", texte: "La plaque porte un code et un QR. Personne ne lit votre identité en passant devant chez vous." },
  { titre: "L'urgence passe toujours", texte: "Même avec un abonnement expiré, une alerte est traitée. Toujours." },
  { titre: "Votre santé reste privée", texte: "Les informations médicales ne sont accessibles qu'à la centrale, jamais à celui qui scanne." },
  { titre: "Une plaque perdue ? Elle est désactivée", texte: "Un QR remplacé ne déclenche plus rien : le nouveau prend le relais." },
];

// Détail de chaque profil, sous son nom (sans répéter le nom lui-même).
const PROFILS: Record<Cible, { nom: string; detail: string }> = {
  PARTICULIER: { nom: "Particulier", detail: "Une personne" },
  FAMILLE: { nom: "Famille", detail: "Tout le foyer protégé" },
  ENTREPRISE: { nom: "Entreprise", detail: "Et autres organisations : ONG, mutuelle…" },
};

export function Centrale() {
  return (
    <section id="centrale" aria-labelledby="titre-centrale" className="trame scroll-mt-20 bg-nuit text-white">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:gap-14 sm:px-6 sm:py-20 lg:grid-cols-[1fr_1.2fr] lg:items-center">
        <div>
          <p className="text-sm font-bold tracking-[0.2em] text-orange uppercase">La centrale APSIG</p>
          <h2 id="titre-centrale" className="mt-3 font-titre text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">
            Derrière chaque QR code, une équipe qui répond.
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-white/75">
            Le QR code ne fait que donner l'alerte. Ce sont les opérateurs de la centrale APSIG qui vérifient la situation, rappellent et mettent en
            relation les personnes qui peuvent agir.
          </p>
          {/* Bouton d'urgence et ses ondes : l'alerte qui arrive à la centrale. */}
          <div aria-hidden="true" className="relative mt-12 hidden size-40 place-items-center lg:grid">
            <span className="onde absolute inset-0 rounded-full bg-signal/50" />
            <span className="onde-2 absolute inset-0 rounded-full bg-signal/40" />
            <span className="relative grid size-24 place-items-center rounded-full bg-signal font-titre text-xl font-black shadow-[0_20px_40px_-12px_rgb(200_16_46_/_0.9)]">
              SOS
            </span>
          </div>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {CENTRALE.map((c) => (
            <li key={c.titre} className="grid grid-cols-[auto_1fr] gap-4 rounded-3xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur sm:block sm:p-6">
              <Icone nom={c.icone} className="size-6 text-orange" />
              <div>
                <h3 className="font-titre text-lg font-bold sm:mt-4">{c.titre}</h3>
                <p className="mt-1 text-sm leading-relaxed text-white/70 sm:mt-2">{c.texte}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Tarifs() {
  return (
    <section id="tarifs" aria-labelledby="titre-tarifs" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-14 sm:px-6 sm:py-20">
      <div className="text-center">
        <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">Tarifs de lancement</p>
        <h2 id="titre-tarifs" className="mx-auto mt-3 max-w-2xl font-titre text-3xl leading-tight font-extrabold tracking-tight sm:text-5xl">
          Un forfait unique, une mensualité selon votre profil.
        </h2>
      </div>

      <div className="mt-8 grid gap-6 sm:mt-12 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="relative overflow-hidden rounded-3xl bg-marine p-6 text-white sm:p-8">
          <div aria-hidden="true" className="absolute -top-20 -right-20 size-64 rounded-full bg-signal/30 blur-2xl" />
          <p className="relative text-sm font-semibold text-white/70">À l'inscription</p>
          <p className="relative mt-2 font-titre text-5xl font-extrabold tracking-tight sm:text-6xl">{francs(FORFAIT_UNIQUE.abonnementFcfa)}</p>
          <p className="relative mt-1 text-white/70">Premier mois de service compris</p>
          <ul className="relative mt-8 grid gap-3">
            {["Plaque portail avec votre code", "QR code intérieur", "Pose de la plaque et adresse vérifiée au GPS", "Accès à la centrale APSIG 24h/24"].map((l) => (
              <li key={l} className="flex items-start gap-3">
                <Icone nom="check" className="mt-0.5 size-5 shrink-0 text-vert" /> {l}
              </li>
            ))}
          </ul>
          <p className="relative mt-8 text-xs leading-relaxed text-white/60">
            Un acompte est possible lors du recensement ; le service s'ouvre au paiement du solde. Les {francs(FORFAIT_UNIQUE.abonnementFcfa)} ne sont pas remboursables.
          </p>
        </div>

        <div className="grid gap-4">
          <p className="text-sm font-semibold text-attenue">Puis, à partir du deuxième mois :</p>
          {CIBLES.map((c: Cible, i) => (
            <div
              key={c}
              className={`flex items-center justify-between gap-4 rounded-3xl bg-white p-5 ring-1 sm:p-6 ${i === 1 ? "ring-2 ring-signal" : "ring-ligne"}`}
            >
              <div className="min-w-0">
                <p className="font-titre text-lg font-bold sm:text-xl">{PROFILS[c].nom}</p>
                <p className="text-sm text-attenue">{PROFILS[c].detail}</p>
              </div>
              <p className="shrink-0 text-right font-titre text-2xl font-extrabold sm:text-3xl">
                {francs(MENSUALITES_FCFA[c])}
                <span className="text-base font-semibold text-attenue">/mois</span>
              </p>
            </div>
          ))}
          <a href="#rappel" className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-encre px-6 py-4 font-bold text-white transition hover:bg-marine">
            Je veux être rappelé <Icone nom="fleche" className="size-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

export function Garanties() {
  return (
    <section aria-labelledby="titre-garanties" className="border-y border-ligne bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 id="titre-garanties" className="font-titre text-2xl font-extrabold tracking-tight sm:text-3xl">
          Pensé pour protéger, jamais pour exposer.
        </h2>
        <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {GARANTIES.map((g) => (
            <li key={g.titre} className="border-l-2 border-signal pl-4">
              <h3 className="font-bold">{g.titre}</h3>
              <p className="mt-2 text-sm leading-relaxed text-attenue">{g.texte}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
