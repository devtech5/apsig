import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { EtatLocalisation } from "@/components/Urgences";
import { Bouton, Carte, Chargement, Ecran, Erreur, Icone, Texte } from "@/components/ui";
import { appelPersonnel } from "@/lib/personnel";
import { usePosition } from "@/lib/position";
import { COULEURS } from "@/lib/theme";

type SupportPose = {
  code: string;
  libelle: string;
  statut: string;
  fixe: boolean;
  porteur: string | null;
  foyer: { libelle: string; adresse: string | null; quartier: string; ville: string; adresseVerifiee: boolean } | null;
  pose: { le: string; agent: string; precisionM: number | null } | null;
  precisionRequiseM: number;
};

export default function PoserQr() {
  const { jeton } = useLocalSearchParams<{ jeton: string }>();
  const localisation = usePosition(true);
  const [s, setS] = useState<SupportPose | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);

  useEffect(() => {
    void appelPersonnel<SupportPose>(`/pose/supports/${jeton}`).then(setS, (e: Error) => setErreur(e.message));
  }, [jeton]);

  async function valider() {
    if (!localisation.position) return;
    setEnvoi(true);
    setErreur(null);
    try {
      setS(await appelPersonnel<SupportPose>(`/pose/supports/${jeton}`, { corps: { position: localisation.position } }));
      setFait(true);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (!s) return erreur ? <Ecran><Erreur message={erreur} /></Ecran> : <Chargement />;
  const p = localisation.position;
  const assezPrecis = !s.fixe || (p != null && p.precisionM <= s.precisionRequiseM);
  return (
    <Ecran>
      <Carte>
        <Texte gras>
          {s.code} · {s.libelle}
        </Texte>
        {s.foyer && (
          <Texte>
            {s.foyer.libelle} — {s.foyer.quartier}, {s.foyer.ville}
            {s.foyer.adresse ? ` · ${s.foyer.adresse}` : ""}
          </Texte>
        )}
        {s.porteur && <Texte attenue>Porté par {s.porteur}</Texte>}
        {s.pose && (
          <Texte attenue>
            Déjà posé le {new Date(s.pose.le).toLocaleString("fr-FR")} par {s.pose.agent}
          </Texte>
        )}
      </Carte>

      {fait ? (
        <Carte style={{ backgroundColor: COULEURS.succesFond }}>
          <Icone nom="check-decagram" taille={40} couleur={COULEURS.succes} />
          <Texte gras>{s.fixe ? "Pose enregistrée : l'adresse du foyer est vérifiée." : "Remise enregistrée."}</Texte>
          <Bouton icone="qrcode-scan" libelle="Scanner le QR suivant" onPress={() => router.replace({ pathname: "/scanner", params: { mode: "pose" } })} />
        </Carte>
      ) : (
        <>
          {s.fixe ? (
            <Texte>Restez devant le QR, à l'extérieur si possible, jusqu'à une précision de {s.precisionRequiseM} m.</Texte>
          ) : (
            <Texte>Support mobile : il n'y a rien à fixer. Enregistrez la remise à son porteur.</Texte>
          )}
          <EtatLocalisation etat={localisation.etat} precisionM={p?.precisionM} />
          {s.fixe && p && !assezPrecis && <Texte attenue>Précision actuelle insuffisante : attendez quelques secondes.</Texte>}
          <Erreur message={erreur} />
          <Bouton grand icone="map-marker-check" libelle={s.fixe ? "Valider la pose ici" : "Enregistrer la remise"} chargement={envoi} desactive={!p || !assezPrecis} onPress={() => void valider()} />
        </>
      )}
    </Ecran>
  );
}
