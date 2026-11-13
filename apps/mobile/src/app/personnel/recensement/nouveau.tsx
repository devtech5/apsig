import { useEffect, useState } from "react";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Bouton, Carte, Chargement, Ecran, Erreur, Texte, styles as ui } from "@/components/ui";
import { appelPersonnel } from "@/lib/personnel";
import { COULEURS } from "@/lib/theme";
import type { Recense } from "./index";

type Ville = { id: string; nom: string; communes: { id: string; nom: string }[]; quartiers: { id: string; nom: string; communeId: string | null }[] };

// Mêmes valeurs que @apsig/domain (forfaits.ts, abonnements.ts) : l'application mobile n'importe pas le paquet domaine.
const CIBLES = [
  { code: "PARTICULIER", libelle: "Particulier", mensualite: "2 000 F/mois" },
  { code: "FAMILLE", libelle: "Famille", mensualite: "5 000 F/mois" },
  { code: "ENTREPRISE", libelle: "Entreprise, ONG, mutuelle…", mensualite: "10 000 F/mois" },
] as const;
const MOYENS = [
  { code: "ESPECES", libelle: "Espèces" },
  { code: "ORANGE_MONEY", libelle: "Orange Money" },
  { code: "MTN_MOMO", libelle: "MTN MoMo" },
  { code: "MOOV_MONEY", libelle: "Moov Money" },
  { code: "WAVE", libelle: "Wave" },
] as const;
const PRIX = "10 000 F";

function Choix<T extends string>({ options, valeur, onChange }: { options: readonly { code: T; libelle: string }[]; valeur: T | null; onChange: (v: T) => void }) {
  return (
    <View style={styles.choix}>
      {options.map((o) => {
        const actif = o.code === valeur;
        return (
          <Pressable key={o.code} onPress={() => onChange(o.code)} accessibilityRole="radio" accessibilityState={{ selected: actif }} style={[styles.puce, actif && styles.puceActive]}>
            <Text style={[styles.puceTexte, actif && styles.puceTexteActif]}>{o.libelle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Champ({ libelle, ...props }: { libelle: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={ui.libelle}>{libelle}</Text>
      <TextInput placeholderTextColor={COULEURS.attenue} style={[ui.champ, { fontSize: 18 }]} {...props} />
    </View>
  );
}

// Étape 1 de l'inscription : l'agent enregistre le client ; le code Code-Secours (code de la plaque) est créé aussitôt.
export default function NouveauRecensement() {
  const [villes, setVilles] = useState<Ville[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [fait, setFait] = useState<Recense | null>(null);

  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [telephone, setTelephone] = useState("");
  const [cible, setCible] = useState<(typeof CIBLES)[number]["code"]>("PARTICULIER");
  const [villeId, setVilleId] = useState<string | null>(null);
  const [communeId, setCommuneId] = useState<string | null>(null);
  const [quartierId, setQuartierId] = useState<string | null>(null);
  const [adresse, setAdresse] = useState("");
  const [paye, setPaye] = useState(true);
  const [moyen, setMoyen] = useState<(typeof MOYENS)[number]["code"]>("ESPECES");
  const [reference, setReference] = useState("");

  useEffect(() => {
    void appelPersonnel<Ville[]>("/pose/referentiel").then(setVilles, (e: Error) => setErreur(e.message));
  }, []);

  if (!villes && !erreur) return <Chargement />;

  const ville = villes?.find((v) => v.id === villeId);
  const avecCommunes = Boolean(ville?.communes.length);
  const quartiers = ville?.quartiers.filter((q) => !avecCommunes || q.communeId === communeId) ?? [];
  const complet = prenom.trim() && nom.trim() && telephone.trim().length >= 8 && quartierId && (!paye || moyen === "ESPECES" || reference.trim().length >= 3);

  async function enregistrer() {
    if (!complet || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const r = await appelPersonnel<Recense>("/pose/recensements", {
        corps: {
          cible,
          prenom,
          nom,
          telephone,
          quartierId,
          adresse,
          paiement: paye ? { operateur: moyen, ...(reference.trim() && { reference: reference.trim() }) } : null,
        },
      });
      setFait(r);
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  if (fait) {
    return (
      <Ecran>
        <Carte style={{ alignItems: "center", gap: 10 }}>
          <Texte attenue>Code Code-Secours du client</Texte>
          <Text selectable style={styles.code}>
            {fait.code ?? "—"}
          </Text>
          <Texte gras>{fait.client}</Texte>
          <Texte attenue>{fait.lieu}</Texte>
          <Text style={[styles.etat, fait.paye ? styles.ok : styles.attente]}>{fait.paye ? `${PRIX} encaissés` : "Paiement à encaisser"}</Text>
          <Texte attenue style={{ textAlign: "center" }}>
            Notez ce code au client. Il sera gravé sur sa plaque, posée lors du second passage avec relevé GPS.
          </Texte>
        </Carte>
        <Bouton grand icone="account-plus" libelle="Recenser un autre client" onPress={() => router.replace("/personnel/recensement/nouveau")} />
        <Bouton secondaire icone="format-list-bulleted" libelle="Mes clients recensés" onPress={() => router.back()} />
      </Ecran>
    );
  }

  return (
    <Ecran>
      <Carte>
        <Text style={styles.titre}>Client</Text>
        <Champ libelle="Prénom" value={prenom} onChangeText={setPrenom} autoCapitalize="words" maxLength={60} />
        <Champ libelle="Nom" value={nom} onChangeText={setNom} autoCapitalize="words" maxLength={60} />
        <Champ libelle="Téléphone" value={telephone} onChangeText={setTelephone} keyboardType="phone-pad" placeholder="07 00 00 00 00" maxLength={20} />
        <Text style={ui.libelle}>Type de client</Text>
        <Choix options={CIBLES} valeur={cible} onChange={setCible} />
        <Texte attenue>
          {PRIX} à l'inscription (premier mois compris), puis {CIBLES.find((c) => c.code === cible)?.mensualite}.
        </Texte>
      </Carte>

      <Carte>
        <Text style={styles.titre}>Lieu</Text>
        <Text style={ui.libelle}>Ville</Text>
        <Choix
          options={(villes ?? []).map((v) => ({ code: v.id, libelle: v.nom }))}
          valeur={villeId}
          onChange={(v) => {
            setVilleId(v);
            setCommuneId(null);
            setQuartierId(null);
          }}
        />
        {avecCommunes && (
          <>
            <Text style={ui.libelle}>Commune</Text>
            <Choix
              options={ville!.communes.map((c) => ({ code: c.id, libelle: c.nom }))}
              valeur={communeId}
              onChange={(c) => {
                setCommuneId(c);
                setQuartierId(null);
              }}
            />
          </>
        )}
        {ville && (!avecCommunes || communeId) && (
          <>
            <Text style={ui.libelle}>Quartier</Text>
            {quartiers.length === 0 ? (
              <Texte attenue>Aucun quartier enregistré ici : demandez à la centrale de l'ajouter.</Texte>
            ) : (
              <Choix options={quartiers.map((q) => ({ code: q.id, libelle: q.nom }))} valeur={quartierId} onChange={setQuartierId} />
            )}
          </>
        )}
        <Champ libelle="Repère (facultatif)" value={adresse} onChangeText={setAdresse} placeholder="Villa 453, près de la pharmacie…" maxLength={300} />
      </Carte>

      <Carte>
        <Text style={styles.titre}>Encaissement · {PRIX}</Text>
        <Choix
          options={[
            { code: "oui", libelle: "Payé" },
            { code: "non", libelle: "Pas encore payé" },
          ]}
          valeur={paye ? "oui" : "non"}
          onChange={(v) => setPaye(v === "oui")}
        />
        {paye && (
          <>
            <Choix options={MOYENS} valeur={moyen} onChange={setMoyen} />
            {moyen !== "ESPECES" && (
              <Champ libelle="Référence de la transaction" value={reference} onChangeText={setReference} autoCapitalize="characters" maxLength={64} />
            )}
          </>
        )}
      </Carte>

      <Erreur message={erreur} />
      <Bouton grand icone="content-save" libelle="Enregistrer le client" desactive={!complet} chargement={envoi} onPress={() => void enregistrer()} />
    </Ecran>
  );
}

const styles = StyleSheet.create({
  titre: { fontSize: 17, fontWeight: "800", color: COULEURS.encre },
  choix: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  puce: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: COULEURS.ligne, backgroundColor: COULEURS.blanc },
  puceActive: { borderColor: COULEURS.brand, backgroundColor: COULEURS.brandClair },
  puceTexte: { fontSize: 16, fontWeight: "600", color: COULEURS.encre },
  puceTexteActif: { color: COULEURS.brand, fontWeight: "800" },
  code: { fontSize: 30, fontWeight: "900", color: COULEURS.brand, letterSpacing: 2, textAlign: "center" },
  etat: { fontSize: 15, fontWeight: "800", paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10, overflow: "hidden" },
  ok: { backgroundColor: COULEURS.succesFond, color: COULEURS.succes },
  attente: { backgroundColor: COULEURS.alerteFond, color: COULEURS.alerteEncre },
});
