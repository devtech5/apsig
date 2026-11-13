"use client";

import { useEffect, useRef, useState } from "react";
import { BOUTON, CHAMP, Champ, Erreur } from "@/components/Formulaire";
import { appelApi } from "@/lib/api";
import { dateHeure, lienCarte } from "@/lib/format";

type Plaque = {
  code: string;
  statut: string;
  foyer: { libelle: string; adresse: string | null; quartier: string; ville: string; adresseVerifiee: boolean } | null;
  titulaire: { prenom: string; nom: string; telephone: string | null } | null;
  pose: { le: string; agent: string; precisionM: number | null } | null;
  precisionRequiseM: number;
};
type Releve = { lat: number; lng: number; precisionM: number };

// Durée maximale d'un relevé : au-delà, l'agent se déplace (dehors, loin des murs) et relance.
const DUREE_RELEVE_MS = 60_000;

// Photo du téléphone réduite (1600 px, JPEG) avant l'envoi : quelques centaines de Ko au lieu de plusieurs Mo.
async function compresser(fichier: File): Promise<string> {
  const image = await createImageBitmap(fichier);
  const echelle = Math.min(1, 1600 / Math.max(image.width, image.height));
  const toile = document.createElement("canvas");
  toile.width = Math.round(image.width * echelle);
  toile.height = Math.round(image.height * echelle);
  toile.getContext("2d")!.drawImage(image, 0, 0, toile.width, toile.height);
  return toile.toDataURL("image/jpeg", 0.75);
}

function Photo({ libelle, valeur, onChange }: { libelle: string; valeur: string | null; onChange: (v: string | null) => void }) {
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <div className="grid gap-2 text-sm font-semibold">
      {libelle}
      {valeur && <img src={valeur} alt={libelle} className="max-h-56 w-full rounded-xl object-cover" />}
      <label className="cursor-pointer rounded-xl border-2 border-dashed border-ligne bg-fond px-3 py-3 text-center font-semibold text-brand">
        {valeur ? "Reprendre la photo" : "Prendre la photo"}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setErreur(null);
            compresser(f).then(onChange, () => setErreur("Photo illisible : reprenez-la"));
          }}
        />
      </label>
      {erreur && <span className="text-xs text-danger">{erreur}</span>}
    </div>
  );
}

// Inscription en deux temps, étape 2 : la pose de la plaque conclut l'inscription.
export default function PagePose() {
  const [code, setCode] = useState("");
  const [plaque, setPlaque] = useState<Plaque | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState(false);
  const [terminee, setTerminee] = useState<Plaque | null>(null);

  async function chercher(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setRecherche(true);
    setErreur(null);
    setPlaque(null);
    try {
      setPlaque(await appelApi<Plaque>(`/pose/plaques/${encodeURIComponent(code.trim())}`));
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setRecherche(false);
    }
  }

  if (terminee) {
    return (
      <div className="mx-auto grid max-w-xl gap-4 p-4">
        <section className="grid justify-items-center gap-2 rounded-2xl bg-white p-6 text-center shadow-sm">
          <span className="rounded-full bg-succes-fond px-3 py-1 text-sm font-bold text-succes">Inscription conclue</span>
          <p className="font-mono text-2xl font-black text-brand">{terminee.code}</p>
          <p className="text-sm text-attenue">
            {terminee.foyer?.libelle} · {terminee.foyer?.quartier}, {terminee.foyer?.ville}
          </p>
          <p className="text-sm">Plaque posée, adresse vérifiée par GPS, photos enregistrées.</p>
        </section>
        <button
          type="button"
          className={`${BOUTON} py-3`}
          onClick={() => {
            setTerminee(null);
            setPlaque(null);
            setCode("");
          }}
        >
          Poser une autre plaque
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-xl gap-4 p-4">
      <h1 className="text-xl font-black">Pose de plaque</h1>
      <form onSubmit={chercher} className="grid gap-2 rounded-2xl bg-white p-4 shadow-sm">
        <Champ libelle="Code de la plaque" aide="Le code gravé sur la plaque, par exemple DAL-LOBIA-053.">
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              placeholder="DAL-LOBIA-053"
              className={`${CHAMP} font-mono uppercase`}
            />
            <button type="submit" disabled={recherche} className={BOUTON}>
              {recherche ? "…" : "Chercher"}
            </button>
          </div>
        </Champ>
      </form>
      <Erreur message={erreur} />
      {plaque && <Conclusion plaque={plaque} onFaite={setTerminee} />}
    </div>
  );
}

function Conclusion({ plaque, onFaite }: { plaque: Plaque; onFaite: (p: Plaque) => void }) {
  const [prenom, setPrenom] = useState(plaque.titulaire?.prenom ?? "");
  const [nom, setNom] = useState(plaque.titulaire?.nom ?? "");
  const [releve, setReleve] = useState<Releve | null>(null);
  const [mesure, setMesure] = useState(false);
  const [photoPlaque, setPhotoPlaque] = useState<string | null>(null);
  const [photoRemise, setPhotoRemise] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const suivi = useRef<{ id: number; minuterie: number } | null>(null);
  const requis = plaque.precisionRequiseM;

  const arreter = () => {
    if (suivi.current) {
      navigator.geolocation.clearWatch(suivi.current.id);
      clearTimeout(suivi.current.minuterie);
      suivi.current = null;
    }
    setMesure(false);
  };
  useEffect(() => arreter, []);

  // Le GPS s'affine en quelques secondes : on garde le meilleur point et on s'arrête dès qu'il atteint la précision requise.
  function relever() {
    if (!("geolocation" in navigator)) return setErreur("Ce téléphone ne donne pas sa position");
    arreter();
    setErreur(null);
    setReleve(null);
    setMesure(true);
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const r = { lat: p.coords.latitude, lng: p.coords.longitude, precisionM: p.coords.accuracy };
        setReleve((avant) => (!avant || r.precisionM <= avant.precisionM ? r : avant));
        if (r.precisionM <= requis) arreter();
      },
      (e) => {
        arreter();
        setErreur(e.code === e.PERMISSION_DENIED ? "Autorisez la localisation pour ce site dans le navigateur, puis recommencez" : "Position indisponible : sortez à découvert et recommencez");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: DUREE_RELEVE_MS },
    );
    const minuterie = window.setTimeout(arreter, DUREE_RELEVE_MS);
    suivi.current = { id, minuterie };
  }

  const precisOk = releve != null && releve.precisionM <= requis;
  const complet = prenom.trim() && nom.trim() && precisOk && photoPlaque && photoRemise;

  async function conclure() {
    if (!complet || envoi || !releve) return;
    setEnvoi(true);
    setErreur(null);
    try {
      onFaite(
        await appelApi<Plaque>(`/pose/plaques/${encodeURIComponent(plaque.code)}`, {
          representant: { prenom: prenom.trim(), nom: nom.trim() },
          position: releve,
          photos: { plaque: photoPlaque, remise: photoRemise },
        }),
      );
    } catch (err) {
      setErreur((err as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-1 rounded-2xl bg-white p-4 shadow-sm">
        <p className="font-mono text-lg font-black text-brand">{plaque.code}</p>
        {plaque.foyer ? (
          <>
            <p className="font-bold">{plaque.foyer.libelle}</p>
            <p className="text-sm text-attenue">
              {plaque.foyer.quartier}, {plaque.foyer.ville}
              {plaque.foyer.adresse && ` · ${plaque.foyer.adresse}`}
            </p>
            {plaque.titulaire?.telephone && <p className="text-sm">Tél. {plaque.titulaire.telephone}</p>}
          </>
        ) : (
          <p className="text-sm text-danger">Cette plaque n'est rattachée à aucun client : voir la centrale avant de la poser.</p>
        )}
        {plaque.pose && (
          <p className="mt-1 rounded-lg bg-alerte-fond px-3 py-2 text-sm text-alerte-encre">
            Déjà posée le {dateHeure(plaque.pose.le)} par {plaque.pose.agent}. Valider à nouveau remplacera la position et les photos.
          </p>
        )}
      </section>

      {plaque.foyer && (
        <>
          <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Personne à contacter</h2>
            <p className="text-xs text-attenue">Le représentant présent à la pose, qui reçoit les codes QR.</p>
            <div className="grid grid-cols-2 gap-3">
              <Champ libelle="Prénoms">
                <input value={prenom} onChange={(e) => setPrenom(e.target.value)} maxLength={60} className={CHAMP} />
              </Champ>
              <Champ libelle="Nom">
                <input value={nom} onChange={(e) => setNom(e.target.value)} maxLength={60} className={CHAMP} />
              </Champ>
            </div>
          </section>

          <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Position GPS · {requis} m de marge</h2>
            <p className="text-xs text-attenue">Placez-vous devant la plaque, à découvert, puis appuyez sur le bouton.</p>
            <button type="button" onClick={relever} disabled={mesure} className={`${BOUTON} py-3`}>
              {mesure ? "Relevé en cours…" : releve ? "Relever à nouveau" : "Relever la position GPS"}
            </button>
            {releve && (
              <p className={`rounded-lg px-3 py-2 text-sm font-semibold ${precisOk ? "bg-succes-fond text-succes" : "bg-alerte-fond text-alerte-encre"}`}>
                Précision : {Math.round(releve.precisionM)} m{" "}
                {precisOk ? "· position retenue" : mesure ? "· affinage en cours…" : `· insuffisante (${requis} m requis) : avancez à découvert et relevez à nouveau`}
                {precisOk && (
                  <a href={lienCarte(releve)} target="_blank" rel="noreferrer" className="ml-2 underline">
                    voir sur la carte
                  </a>
                )}
              </p>
            )}
          </section>

          <section className="grid gap-4 rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Photos</h2>
            <Photo libelle="Plaque posée" valeur={photoPlaque} onChange={setPhotoPlaque} />
            <Photo libelle="Remise des codes QR" valeur={photoRemise} onChange={setPhotoRemise} />
          </section>

          <Erreur message={erreur} />
          <button type="button" onClick={() => void conclure()} disabled={!complet || envoi} className={`${BOUTON} py-3 text-base`}>
            {envoi ? "Envoi…" : "Conclure l'inscription"}
          </button>
          {!complet && <p className="text-center text-xs text-attenue">Il faut le représentant, une position à {requis} m près et les deux photos.</p>}
        </>
      )}
    </div>
  );
}
