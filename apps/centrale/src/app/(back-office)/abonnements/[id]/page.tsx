"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Erreur } from "@/components/Formulaire";
import { FicheFoyer, type Agir } from "@/components/FicheFoyer";
import type { Foyer, Referentiel } from "@/lib/abonnements";
import { appelApi } from "@/lib/api";

export default function PageFoyer() {
  const { id } = useParams<{ id: string }>();
  const [foyer, setFoyer] = useState<Foyer | null>(null);
  const [referentiel, setReferentiel] = useState<Referentiel | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    Promise.all([appelApi<Foyer>(`/abonnements/foyers/${id}`), appelApi<Referentiel>("/abonnements/referentiel")]).then(
      ([f, r]) => {
        setFoyer(f);
        setReferentiel(r);
      },
      (e: Error) => setErreur(e.message),
    );
  }, [id]);

  const agir: Agir = useCallback(async (chemin, corps, methode) => {
    setEnvoi(true);
    setErreur(null);
    try {
      setFoyer(await appelApi<Foyer>(chemin, corps ?? (methode === "DELETE" ? undefined : {}), methode));
      return true;
    } catch (e) {
      setErreur((e as Error).message);
      return false;
    } finally {
      setEnvoi(false);
    }
  }, []);

  return (
    <div className="mx-auto grid max-w-6xl gap-4 p-4">
      <Erreur message={erreur} />
      {!foyer && !erreur && <p className="text-attenue">Chargement…</p>}
      {foyer && referentiel && <FicheFoyer f={foyer} referentiel={referentiel} agir={agir} envoi={envoi} />}
    </div>
  );
}
