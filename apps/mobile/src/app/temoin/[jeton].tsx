import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { EtatLocalisation, ListeUrgences } from "@/components/Urgences";
import { Carte, Chargement, Ecran, Erreur, NumerosSecours, Texte } from "@/components/ui";
import { appel } from "@/lib/api";
import { CLES, coffre } from "@/lib/coffre";
import { PROBLEME_DE, usePosition } from "@/lib/position";
import type { SuiviAlerte, SupportPublic, Urgence } from "@/lib/types";

// Identifiant pseudonyme de l'appareil (aucune donnée du téléphone) : il aide la centrale à repérer les abus.
async function appareilId() {
  const existant = await coffre.lire(CLES.appareil).catch(() => null);
  if (existant) return existant;
  const id = Array.from({ length: 24 }, () => "abcdefghijkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 32)]).join("");
  await coffre.ecrire(CLES.appareil, id).catch(() => undefined);
  return id;
}

// Témoin devant un QR APSIG : même parcours que la page web, avec la localisation native du téléphone.
export default function Temoin() {
  const { jeton } = useLocalSearchParams<{ jeton: string }>();
  const localisation = usePosition(true);
  const [support, setSupport] = useState<SupportPublic | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    void appel<SupportPublic>(`/public/supports/${jeton}`).then(setSupport, (e: Error) => setErreur(e.message));
  }, [jeton]);

  async function declencher(u: Urgence) {
    setEnvoi(true);
    setErreur(null);
    try {
      const { position, etat } = localisation;
      const probleme = PROBLEME_DE[etat];
      const r = await appel<SuiviAlerte & { cleTemoin: string }>("/public/alertes", {
        corps: { jeton, type: u.type, appareilId: await appareilId(), ...(position ? { position } : probleme ? { problemePosition: probleme } : {}) },
      });
      router.replace({ pathname: "/suivi/[numero]", params: { numero: r.numero, cle: r.cleTemoin, nouvelle: "1" } });
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!support) {
    return erreur ? (
      <Ecran>
        <Erreur message={erreur} />
        <NumerosSecours />
      </Ecran>
    ) : (
      <Chargement />
    );
  }
  return (
    <Ecran>
      <Carte>
        <Texte gras>{support.libelle}</Texte>
        <Texte attenue>{support.lieu ? `${support.lieu.quartier}, ${support.lieu.ville}` : support.code}</Texte>
      </Carte>
      <Texte gras>Que se passe-t-il ? Touchez le bouton : la centrale APSIG est prévenue tout de suite.</Texte>
      <EtatLocalisation etat={localisation.etat} precisionM={localisation.position?.precisionM} />
      <Erreur message={erreur} />
      <ListeUrgences urgences={support.urgences} onChoisir={(u) => void declencher(u)} desactive={envoi} />
      <NumerosSecours />
    </Ecran>
  );
}
