const QUESTIONS: { q: string; r: string }[] = [
  {
    q: "CODE-SECOURS remplace-t-il les numéros d'urgence ?",
    r: "Non. APSIG facilite la transmission de l'alerte vers votre famille et les secours. En cas d'urgence vitale, appelez d'abord la Police (170), les Pompiers (180) ou le SAMU (185).",
  },
  {
    q: "La personne qui scanne doit-elle installer une application ?",
    r: "Non. L'appareil photo de n'importe quel téléphone suffit : une page s'ouvre, elle choisit l'urgence et l'alerte part vers la centrale.",
  },
  {
    q: "Que voit-elle de mes informations ?",
    r: "Seulement le type de support et, pour une plaque, le quartier. Ni votre nom, ni votre numéro, ni vos informations de santé, réservées à la centrale.",
  },
  {
    q: "Et si quelqu'un déclenche une alerte par erreur ?",
    r: "Il peut l'annuler en un appui tant qu'aucune équipe n'est sur place. La centrale rappelle aussi le témoin pour vérifier chaque alerte.",
  },
  {
    q: "Ma position est-elle suivie ?",
    r: "La position n'est partagée que par le témoin, et seulement s'il l'accepte au moment de l'alerte. Pour une plaque, c'est l'adresse vérifiée lors de la pose qui sert de repère.",
  },
  {
    q: "Comment s'inscrire ?",
    r: "Laissez vos coordonnées ci-dessous : un conseiller APSIG vous rappelle, puis un agent passe chez vous pour l'inscription et la pose de la plaque. Aucun paiement en ligne.",
  },
];

export function Questions() {
  return (
    <section id="questions" aria-labelledby="titre-questions" className="mx-auto grid max-w-6xl scroll-mt-20 gap-6 px-4 py-14 sm:gap-10 sm:px-6 sm:py-20 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <p className="text-sm font-bold tracking-[0.2em] text-signal uppercase">Questions fréquentes</p>
        <h2 id="titre-questions" className="mt-3 font-titre text-3xl leading-tight font-extrabold tracking-tight sm:text-4xl">Ce qu'on nous demande le plus souvent.</h2>
      </div>
      <div className="divide-y divide-ligne border-y border-ligne">
        {QUESTIONS.map((x) => (
          <details key={x.q} className="group py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-titre text-base font-bold sm:text-lg [&::-webkit-details-marker]:hidden">
              {x.q}
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-sable text-xl transition group-open:rotate-45">
                +
              </span>
            </summary>
            <p className="mt-3 max-w-2xl leading-relaxed text-attenue">{x.r}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
