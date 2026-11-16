"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Erreur } from "@/components/Formulaire";
import { Icone } from "@/components/Icone";
import { GraphiqueEncaissements } from "@/components/qg/GraphiqueEncaissements";
import { ASurveiller, DerniersEncaissements, EquipeDuMois, Indicateur, LienPanneau, Panneau } from "@/components/qg/Panneaux";
import { useSession } from "@/components/Session";
import { appelApi } from "@/lib/api";
import { dateDuJour, fcfa, pluriel, type TableauDeBordQg } from "@/lib/qg";
import { NOMS_SITE, siteCourant } from "@/lib/site";

// Accueil du QG (base.apsig.online) : chiffres du mois, encaissements des six derniers mois, points à surveiller,
// derniers encaissements et activité de l'équipe terrain.
export default function PageTableauDeBord() {
  const { compte } = useSession();
  const [t, setT] = useState<TableauDeBordQg | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    appelApi<TableauDeBordQg>("/finance/tableau-de-bord").then(setT, (e: Error) => setErreur(e.message));
  }, []);

  const prenom = compte.nom.trim().split(/\s+/)[0];
  // L'équipe terrain se gère sur le site du terrain (en développement, tout est sur le même site).
  const lienEquipe = !compte.espaces.includes("equipe") ? null : siteCourant() === "tout" ? "/equipe" : `${NOMS_SITE.terrain.adresse}/equipe`;

  return (
    <div className="mx-auto grid max-w-7xl gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">Bonjour {prenom}</h1>
          <p className="text-sm text-attenue">{dateDuJour()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/finance" className="flex items-center gap-2 rounded-lg border border-ligne bg-white px-4 py-2 text-sm font-semibold hover:bg-fond">
            <Icone nom="portefeuille" className="size-4" /> Finance
          </Link>
          {compte.espaces.includes("abonnements") && (
            <Link href="/abonnements/nouveau" className="flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white hover:bg-brand/90">
              <Icone nom="plus" className="size-4" /> Nouvel abonnement
            </Link>
          )}
        </div>
      </div>

      <Erreur message={erreur} />
      {!t && !erreur && <p className="text-attenue">Chargement…</p>}
      {t && <Contenu t={t} lienEquipe={lienEquipe} />}
    </div>
  );
}

function Contenu({ t, lienEquipe }: { t: TableauDeBordQg; lienEquipe: string | null }) {
  const i = t.indicateurs;
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Indicateur libelle="Encaissé ce mois" valeur={fcfa(i.encaisseMoisFcfa)} detail={`Aujourd'hui : ${fcfa(i.encaisseJourFcfa)}`} icone="portefeuille" />
        <Indicateur libelle="Abonnés actifs" valeur={String(i.abonnesActifs)} detail={`${pluriel(i.nouveauxAbonnesMois, "nouvel abonné", "nouveaux abonnés")} ce mois`} icone="maison" />
        <Indicateur libelle="Reste à encaisser" valeur={fcfa(i.resteAEncaisserFcfa)} detail={`${pluriel(i.clientsNonSoldes, "client")} pas encore soldé${i.clientsNonSoldes > 1 ? "s" : ""}`} icone="horloge" />
        <Indicateur libelle="Mensualités attendues" valeur={`${fcfa(i.mensualitesFcfa)}/mois`} detail="Abonnements en cours" icone="calendrier" />
        <Indicateur libelle="Recensés ce mois" valeur={String(i.recensesMois)} detail={`${pluriel(i.posesMois, "plaque posée", "plaques posées")} ce mois`} icone="equipe" />
        <Indicateur libelle="Plaques à poser" valeur={String(i.aPoser)} detail={`Dont ${i.aPoserDepuis7j} depuis plus de 7 jours`} icone="repere" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panneau titre="Encaissements des six derniers mois" sousTitre="Abonnements soldés et acomptes, en FCFA" action={<LienPanneau href="/finance">Détail</LienPanneau>}>
          <GraphiqueEncaissements mois={t.parMois} />
        </Panneau>
        <ASurveiller s={t.aSurveiller} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DerniersEncaissements lignes={t.derniersEncaissements} />
        <EquipeDuMois membres={t.terrain} lienEquipe={lienEquipe} />
      </div>
    </>
  );
}
