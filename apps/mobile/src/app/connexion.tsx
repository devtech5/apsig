import { useState } from "react";
import { router } from "expo-router";
import { Linking, Text, TextInput, View } from "react-native";
import { Bouton, Carte, Ecran, Erreur, styles, Texte } from "@/components/ui";
import { auth, comptePersonnel, type ComptePersonnel } from "@/lib/personnel";
import { useSession } from "@/lib/session";
import { COULEURS } from "@/lib/theme";

type Etape = "identifiants" | "code" | "activation";
const ESPACES_MOBILE = ["pose", "terrain"];

// Personnel APSIG : mêmes identifiants et même double authentification que la centrale.
export default function Connexion() {
  const { ouvrirPersonnel } = useSession();
  const [etape, setEtape] = useState<Etape>("identifiants");
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [code, setCode] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  async function executer(action: () => Promise<void>) {
    setEnvoi(true);
    setErreur(null);
    try {
      await action();
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  async function entrer(compte: ComptePersonnel | null) {
    if (!compte) throw new Error("Connexion refusée");
    if (compte.deuxFacteursRequis) {
      // Première connexion : la double authentification s'active ici, avec l'application d'authentification du téléphone.
      const r = await auth.twoFactor.enable({ password: motDePasse });
      if (r.error) throw new Error(r.error.message ?? "Activation impossible");
      if (r.data.method !== "totp") throw new Error("Activation impossible");
      setTotpURI(r.data.totpURI);
      setEtape("activation");
      return;
    }
    if (!compte.espaces.some((e) => ESPACES_MOBILE.includes(e))) {
      await auth.signOut();
      throw new Error("Votre rôle n'utilise pas l'application mobile : travaillez depuis la centrale web.");
    }
    ouvrirPersonnel(compte);
    router.replace("/personnel");
  }

  const seConnecter = () =>
    executer(async () => {
      const r = await auth.signIn.email({ email: email.trim().toLowerCase(), password: motDePasse });
      if (r.error) throw new Error(r.error.status === 401 ? "E-mail ou mot de passe incorrect" : (r.error.message ?? "Connexion impossible"));
      if ((r.data as { twoFactorRedirect?: boolean }).twoFactorRedirect) return setEtape("code");
      await entrer(await comptePersonnel());
    });

  const verifier = () =>
    executer(async () => {
      const r = await auth.twoFactor.verifyTotp({ code });
      if (r.error) throw new Error("Code incorrect ou expiré : saisissez le code affiché maintenant");
      setCode("");
      await entrer(await comptePersonnel());
    });

  return (
    <Ecran>
      {etape === "identifiants" && (
        <>
          <Champ libelle="E-mail" valeur={email} onChange={setEmail} type="email" />
          <Champ libelle="Mot de passe" valeur={motDePasse} onChange={setMotDePasse} type="motDePasse" />
          <Erreur message={erreur} />
          <Bouton grand icone="login" libelle="Se connecter" chargement={envoi} desactive={!email || motDePasse.length < 12} onPress={() => void seConnecter()} />
        </>
      )}
      {etape === "activation" && totpURI && (
        <Carte>
          <Texte gras>Activez la double authentification</Texte>
          <Texte>1. Touchez le bouton : votre application d'authentification (Google Authenticator, Authy…) ajoute le compte APSIG.</Texte>
          <Bouton secondaire icone="shield-key" libelle="Ajouter à l'application" onPress={() => void Linking.openURL(totpURI)} />
          <Texte attenue>Sinon, saisissez cette clé à la main : {/[?&]secret=([A-Z2-7]+)/i.exec(totpURI)?.[1]}</Texte>
          <Texte>2. Revenez ici et tapez le code à 6 chiffres qu'elle affiche.</Texte>
        </Carte>
      )}
      {(etape === "code" || etape === "activation") && (
        <>
          {etape === "code" && <Texte>Ouvrez votre application d'authentification et tapez le code APSIG à 6 chiffres.</Texte>}
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            placeholderTextColor={COULEURS.attenue}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            style={[styles.champ, { letterSpacing: 8, fontWeight: "800", textAlign: "center" }]}
            accessibilityLabel="Code à 6 chiffres"
          />
          <Erreur message={erreur} />
          <Bouton grand icone="check-circle" libelle="Valider" chargement={envoi} desactive={code.length !== 6} onPress={() => void verifier()} />
        </>
      )}
    </Ecran>
  );
}

function Champ({ libelle, valeur, onChange, type }: { libelle: string; valeur: string; onChange: (v: string) => void; type: "email" | "motDePasse" }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.libelle}>{libelle}</Text>
      <TextInput
        value={valeur}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={type === "motDePasse"}
        keyboardType={type === "email" ? "email-address" : "default"}
        autoComplete={type === "email" ? "email" : "current-password"}
        textContentType={type === "email" ? "username" : "password"}
        style={[styles.champ, { fontSize: 18 }]}
        accessibilityLabel={libelle}
      />
    </View>
  );
}
