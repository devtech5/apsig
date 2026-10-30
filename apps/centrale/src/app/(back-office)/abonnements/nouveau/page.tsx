"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChampsSouscription, ChoixAdresse, lireSouscription } from "@/components/ChampsAbonnement";
import { Bloc, BOUTON, CHAMP, Champ, Erreur, valeur } from "@/components/Formulaire";
import type { Foyer, Referentiel } from "@/lib/abonnements";
import { appelApi, type Position } from "@/lib/api";

// Souscription au guichet ou par téléphone : foyer, titulaire, formule et encaissement en une fois.
export default function PageNouveauFoyer() {
  const router = useRouter();
  const [referentiel, setReferentiel] = useState<Referentiel | null>(null);
  const [quartierId, setQuartierId] = useState("");
  const [position, setPosition] = useState<Position | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    appelApi<Referentiel>("/abonnements/referentiel").then(setReferentiel, (e: Error) => setErreur(e.message));
  }, []);

  async function creer(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setEnvoi(true);
    setErreur(null);
    try {
      const foyer = await appelApi<Foyer>("/abonnements/foyers", {
        libelle: valeur(f, "libelle"),
        adresse: valeur(f, "adresse"),
        quartierId,
        position,
        titulaire: { prenom: valeur(f, "prenom"), nom: valeur(f, "nom"), telephone: valeur(f, "telephone") },
        souscription: lireSouscription(f),
      });
      router.push(`/abonnements/${foyer.id}`);
    } catch (err) {
      setErreur((err as Error).message);
      setEnvoi(false);
    }
  }

  if (!referentiel) return <div className="p-6"><Erreur message={erreur} />{!erreur && <p className="text-attenue">Chargement…</p>}</div>;

  return (
    <form onSubmit={creer} className="mx-auto grid max-w-3xl gap-4 p-4">
      <div className="flex items-center gap-3">
        <Link href="/abonnements" className="text-sm text-brand underline">
          ← Abonnements
        </Link>
        <h1 className="text-xl font-black">Nouveau foyer</h1>
      </div>

      <Bloc titre="Adresse">
        <div className="grid gap-3">
          <Champ libelle="Libellé" aide="Comme on le dirait au téléphone : « Villa 453, Lobia », « Cour commune derrière la mosquée »">
            <input name="libelle" required maxLength={120} className={CHAMP} />
          </Champ>
          <ChoixAdresse referentiel={referentiel} quartierId={quartierId} onQuartier={setQuartierId} position={position} onPosition={setPosition} />
          <Champ libelle="Indications pour les secours" aide="Repères, couleur du portail, rue…">
            <textarea name="adresse" maxLength={300} rows={2} className={CHAMP} />
          </Champ>
        </div>
      </Bloc>

      <Bloc titre="Titulaire">
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ libelle="Prénom">
            <input name="prenom" required maxLength={60} className={CHAMP} />
          </Champ>
          <Champ libelle="Nom">
            <input name="nom" required maxLength={60} className={CHAMP} />
          </Champ>
          <Champ libelle="Téléphone">
            <input name="telephone" type="tel" required placeholder="+225 07 00 00 00 00" className={CHAMP} />
          </Champ>
        </div>
        <p className="mt-2 text-xs text-attenue">Membres de la famille, santé et contacts d'urgence s'ajoutent ensuite sur la fiche du foyer.</p>
      </Bloc>

      <Bloc titre="Abonnement">
        <ChampsSouscription formules={referentiel.formules} facultative />
      </Bloc>

      <Erreur message={erreur} />
      <div className="flex justify-end">
        <button disabled={envoi || !quartierId} className={BOUTON}>
          {envoi ? "Création…" : "Créer le foyer"}
        </button>
      </div>
    </form>
  );
}
