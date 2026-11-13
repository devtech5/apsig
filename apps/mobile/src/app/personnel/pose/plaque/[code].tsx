import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text, TextInput, View } from "react-native";
import { PrisePhoto } from "@/components/PrisePhoto";
import { EtatLocalisation } from "@/components/Urgences";
import { Bouton, Carte, Chargement, Ecran, Erreur, Icone, Texte, styles as ui } from "@/components/ui";
import { appelPersonnel } from "@/lib/personnel";
import { usePosition, type PositionPrecise } from "@/lib/position";
import { COULEURS } from "@/lib/theme";

type Plaque = {
  code: string;
  foyer: { libelle: string; adresse: string | null; quartier: string; ville: string; adresseVerifiee: boolean } | null;
  titulaire: { prenom: string; nom: string; telephone: string | null } | null;
  recenseur: { nom: string; telephone: string | null } | null;
  recenseLe: string | null;
  pose: { le: string; agent: string; precisionM: number | null } | null;
  precisionRequiseM: number;
};

function Champ({ libelle, ...props }: { libelle: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={ui.libelle}>{libelle}</Text>
      <TextInput placeholderTextColor={COULEURS.attenue} style={[ui.champ, { fontSize: 18 }]} {...props} />
    </View>
  );
}

// Étape 2 de l'inscription : la pose de la plaque, identifiée par son code, conclut l'inscription.
export default function PoserPlaque() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const [plaque, setPlaque] = useState<Plaque | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [releve, setReleve] = useState(false);
  const [retenue, setRetenue] = useState<PositionPrecise | null>(null);
  const [photoPlaque, setPhotoPlaque] = useState<string | null>(null);
  const [photoRemise, setPhotoRemise] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState(false);
  const localisation = usePosition(releve, true);

  useEffect(() => {
    void appelPersonnel<Plaque>(`/pose/plaques/${encodeURIComponent(code)}`).then(
      (p) => {
        setPlaque(p);
        setPrenom(p.titulaire?.prenom ?? "");
        setNom(p.titulaire?.nom ?? "");
      },
      (e: Error) => setErreur(e.message),
    );
  }, [code]);

  // Le GPS s'affine en quelques secondes : on garde le meilleur point, et on arrête dès la précision requise atteinte.
  const p = localisation.position;
  useEffect(() => {
    if (!releve || !p || !plaque) return;
    setRetenue((avant) => (!avant || p.precisionM <= avant.precisionM ? p : avant));
    if (p.precisionM <= plaque.precisionRequiseM) setReleve(false);
  }, [p, releve, plaque]);

  if (!plaque) return erreur ? <Ecran><Erreur message={erreur} /></Ecran> : <Chargement />;

  const requis = plaque.precisionRequiseM;
  const precisOk = retenue != null && retenue.precisionM <= requis;
  const complet = prenom.trim() && nom.trim() && precisOk && photoPlaque && photoRemise;

  async function conclure() {
    if (!complet || envoi || !retenue) return;
    setEnvoi(true);
    setErreur(null);
    try {
      setPlaque(
        await appelPersonnel<Plaque>(`/pose/plaques/${encodeURIComponent(plaque!.code)}`, {
          corps: { representant: { prenom: prenom.trim(), nom: nom.trim() }, position: retenue, photos: { plaque: photoPlaque, remise: photoRemise } },
        }),
      );
      setFait(true);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (fait) {
    return (
      <Ecran>
        <Carte style={{ backgroundColor: COULEURS.succesFond, alignItems: "center" }}>
          <Icone nom="check-decagram" taille={48} couleur={COULEURS.succes} />
          <Texte gras>Inscription conclue</Texte>
          <Text style={{ fontSize: 24, fontWeight: "900", color: COULEURS.brand }}>{plaque.code}</Text>
          <Texte style={{ textAlign: "center" }}>Plaque posée, adresse vérifiée par GPS, photos enregistrées.</Texte>
        </Carte>
        <Bouton grand icone="qrcode-plus" libelle="Poser une autre plaque" onPress={() => router.replace("/personnel/pose")} />
      </Ecran>
    );
  }

  return (
    <Ecran>
      <Carte>
        <Text style={{ fontSize: 22, fontWeight: "900", color: COULEURS.brand, letterSpacing: 1 }}>{plaque.code}</Text>
        {plaque.foyer ? (
          <>
            <Texte gras>{plaque.foyer.libelle}</Texte>
            <Texte attenue>
              {plaque.foyer.quartier}, {plaque.foyer.ville}
              {plaque.foyer.adresse ? ` · ${plaque.foyer.adresse}` : ""}
            </Texte>
            {plaque.titulaire?.telephone && <Texte>Tél. {plaque.titulaire.telephone}</Texte>}
            {plaque.recenseur && (
              <Texte attenue>
                Recensé par {plaque.recenseur.nom}
                {plaque.recenseur.telephone ? ` (${plaque.recenseur.telephone})` : ""}
              </Texte>
            )}
          </>
        ) : (
          <Erreur message="Cette plaque n'est rattachée à aucun client : voir la centrale avant de la poser." />
        )}
        {plaque.pose && (
          <Texte attenue>
            Déjà posée le {new Date(plaque.pose.le).toLocaleString("fr-FR")} par {plaque.pose.agent}. Valider à nouveau remplacera la position et les photos.
          </Texte>
        )}
      </Carte>

      {plaque.foyer && (
        <>
          <Carte>
            <Text style={ui.libelle}>Personne à contacter</Text>
            <Texte attenue>Le représentant présent à la pose, qui reçoit les codes QR.</Texte>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Champ libelle="Nom" value={nom} onChangeText={setNom} autoCapitalize="words" maxLength={60} />
              <Champ libelle="Prénoms" value={prenom} onChangeText={setPrenom} autoCapitalize="words" maxLength={60} />
            </View>
          </Carte>

          <Carte>
            <Text style={ui.libelle}>Position GPS · {requis} m de marge</Text>
            <Texte attenue>Placez-vous devant la plaque, à découvert, puis appuyez sur le bouton.</Texte>
            <Bouton
              icone="crosshairs-gps"
              libelle={releve ? "Relevé en cours…" : retenue ? "Relever à nouveau" : "Relever la position GPS"}
              chargement={releve}
              onPress={() => {
                setRetenue(null);
                setReleve(true);
              }}
            />
            {releve && <EtatLocalisation etat={localisation.etat} precisionM={p?.precisionM} />}
            {retenue && (
              <Texte gras style={{ color: precisOk ? COULEURS.succes : COULEURS.alerteEncre }}>
                Précision : {Math.round(retenue.precisionM)} m
                {precisOk ? " · position retenue" : releve ? " · affinage en cours…" : ` · insuffisante (${requis} m requis) : avancez à découvert et relevez à nouveau`}
              </Texte>
            )}
            {releve && (
              <Bouton secondaire couleur={COULEURS.attenue} icone="stop" libelle="Arrêter le relevé" onPress={() => setReleve(false)} />
            )}
          </Carte>

          <Carte>
            <PrisePhoto libelle="Photo de la plaque posée" valeur={photoPlaque} onChange={setPhotoPlaque} />
            <PrisePhoto libelle="Photo de la remise des codes QR" valeur={photoRemise} onChange={setPhotoRemise} />
          </Carte>

          <Erreur message={erreur} />
          <Bouton grand icone="check-decagram" libelle="Conclure l'inscription" desactive={!complet} chargement={envoi} onPress={() => void conclure()} />
          {!complet && <Texte attenue>Il faut le représentant, une position à {requis} m près et les deux photos.</Texte>}
        </>
      )}
    </Ecran>
  );
}
