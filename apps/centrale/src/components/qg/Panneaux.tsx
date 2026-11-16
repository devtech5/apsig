import Link from "next/link";
import { LIBELLES_MOYEN_PAIEMENT, LIBELLES_ROLE } from "@apsig/domain";
import { Icone, type NomIcone } from "@/components/Icone";
import { dateCourte, fcfa, pluriel, type TableauDeBordQg } from "@/lib/qg";

// Briques du tableau de bord du QG : carte d'indicateur, panneau titré, points à surveiller, listes du bas.

export function Indicateur({ libelle, valeur, detail, icone }: { libelle: string; valeur: string; detail: string; icone: NomIcone }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-ligne bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm text-attenue">{libelle}</span>
        <Icone nom={icone} className="size-4 shrink-0 text-attenue" />
      </div>
      <span className="font-mono text-2xl font-black tracking-tight">{valeur}</span>
      <span className="text-xs text-attenue">{detail}</span>
    </div>
  );
}

export function Panneau({ titre, sousTitre, action, children }: { titre: React.ReactNode; sousTitre?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-4 rounded-2xl border border-ligne bg-white p-5">
      <header className="flex min-w-0 items-start justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <h2 className="font-bold">{titre}</h2>
          {sousTitre && <p className="text-sm text-attenue">{sousTitre}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function LienPanneau({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="shrink-0 text-sm font-semibold text-brand hover:underline">
      {children}
    </Link>
  );
}

const NATURES: Record<TableauDeBordQg["aSurveiller"]["elements"][number]["nature"], { libelle: string; icone: NomIcone; style: string }> = {
  solde: { libelle: "À encaisser", icone: "portefeuille", style: "bg-alerte-fond text-alerte-encre" },
  expiration: { libelle: "Renouvellement", icone: "calendrier", style: "bg-brand-clair text-brand" },
  pose: { libelle: "Pose en retard", icone: "repere", style: "bg-danger-fond text-danger" },
};

export function ASurveiller({ s }: { s: TableauDeBordQg["aSurveiller"] }) {
  const total = s.acomptesAnciens + s.expirentBientot + s.posesEnRetard;
  return (
    <Panneau
      titre={
        <span className="flex items-center gap-2">
          <Icone nom="alerte" className="size-4 text-alerte-encre" /> À surveiller
        </span>
      }
      sousTitre={`${pluriel(s.acomptesAnciens, "solde")} en attente depuis plus de 30 j · ${pluriel(s.expirentBientot, "abonnement")} à renouveler sous 30 j · ${pluriel(s.posesEnRetard, "plaque")} à poser depuis plus de 7 j`}
      action={<span className="rounded-full bg-fond px-2.5 py-0.5 text-xs font-bold">{total}</span>}
    >
      {s.elements.length === 0 ? (
        <p className="text-sm text-attenue">Rien à signaler : aucun solde ancien, aucun renouvellement proche, aucune pose en retard.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] gap-1">
          {s.elements.map((e) => {
            const n = NATURES[e.nature];
            return (
              <li key={`${e.nature}-${e.foyerId}`}>
                <Link href={`/abonnements/${e.foyerId}`} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-fond">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${n.style}`}>
                    <Icone nom={n.icone} className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{e.client}</span>
                    <span className="block truncate text-xs text-attenue">
                      {n.libelle} · {e.detail}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Panneau>
  );
}

export function DerniersEncaissements({ lignes }: { lignes: TableauDeBordQg["derniersEncaissements"] }) {
  return (
    <Panneau titre="Derniers encaissements" action={<LienPanneau href="/finance">Toute la finance</LienPanneau>}>
      {lignes.length === 0 ? (
        <p className="text-sm text-attenue">Aucun encaissement pour l'instant.</p>
      ) : (
        <ul className="grid grid-cols-[minmax(0,1fr)] divide-y divide-ligne">
          {lignes.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2.5">
              <span className="w-12 shrink-0 font-mono text-xs text-attenue">{dateCourte(p.le)}</span>
              <Link href={`/abonnements/${p.foyer.id}`} className="min-w-0 flex-1 hover:underline">
                <span className="block truncate text-sm font-semibold">{p.foyer.libelle}</span>
                <span className="block text-xs text-attenue">
                  {LIBELLES_MOYEN_PAIEMENT[p.operateur]} · {p.nature === "acompte" ? "acompte" : "abonnement"}
                </span>
              </Link>
              <span className="shrink-0 font-mono text-sm font-bold">{fcfa(p.montantFcfa)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panneau>
  );
}

export function EquipeDuMois({ membres, lienEquipe }: { membres: TableauDeBordQg["terrain"]; lienEquipe: string | null }) {
  return (
    <Panneau titre="Équipe terrain du mois" sousTitre="Clients recensés et plaques posées depuis le 1er" action={lienEquipe && <LienPanneau href={lienEquipe}>Équipe</LienPanneau>}>
      {membres.length === 0 ? (
        <p className="text-sm text-attenue">Aucun recensement ni aucune pose ce mois-ci.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-attenue">
              <th className="pb-2 font-normal">Membre</th>
              <th className="pb-2 text-right font-normal">Recensés</th>
              <th className="pb-2 text-right font-normal">Posées</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ligne">
            {membres.map((m) => (
              <tr key={m.id}>
                <td className="py-2">
                  <span className="block font-semibold">{m.nom}</span>
                  <span className="block text-xs text-attenue">{LIBELLES_ROLE[m.role]}</span>
                </td>
                <td className="py-2 text-right font-mono">{m.recensesMois}</td>
                <td className="py-2 text-right font-mono">{m.posesMois}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panneau>
  );
}
