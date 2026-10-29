"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { creerDecodeur, extraireJeton, type Decodeur } from "@/lib/qr";
import { Icone } from "./Icone";

type Etat = "repos" | "demarrage" | "scan" | "trouve";
type Erreur = { titre: string; message: string };

const INTERVALLE_SCAN_MS = 200;
const DUREE_AVIS_MS = 3000;

const ERREURS = {
  refus: {
    titre: "Accès à la caméra refusé",
    message: "Autorisez la caméra dans les réglages du navigateur, ou importez une photo du QR code.",
  },
  absente: { titre: "Aucune caméra trouvée", message: "Importez une photo du QR code à la place." },
  nonSupporte: {
    titre: "Caméra indisponible",
    message: "Ce navigateur ne donne pas accès à la caméra ici. Ouvrez l'appareil photo du téléphone ou importez une photo.",
  },
  echec: { titre: "La caméra n'a pas démarré", message: "Fermez les autres applications qui l'utilisent, puis réessayez." },
  photo: { titre: "Aucun QR code lu", message: "Reprenez la photo bien à plat, nette et sans reflet, le QR code entier dans l'image." },
  etranger: { titre: "QR code non reconnu", message: "Ce QR code n'appartient pas à CODE-SECOURS. Scannez le QR d'une plaque, d'un bracelet ou d'une carte APSIG." },
} satisfies Record<string, Erreur>;

const vibrer = (motif: number | number[]) => navigator.vibrate?.(motif);

function erreurCamera(e: unknown): Erreur {
  const nom = (e as DOMException)?.name;
  if (nom === "NotAllowedError" || nom === "SecurityError") return ERREURS.refus;
  if (nom === "NotFoundError" || nom === "OverconstrainedError") return ERREURS.absente;
  return ERREURS.echec;
}

export function ScannerQr() {
  const router = useRouter();
  const [etat, setEtat] = useState<Etat>("repos");
  const [erreur, setErreur] = useState<Erreur | null>(null);
  const [avis, setAvis] = useState<string | null>(null);
  const [lampe, setLampe] = useState<{ dispo: boolean; allumee: boolean }>({ dispo: false, allumee: false });

  const video = useRef<HTMLVideoElement>(null);
  const flux = useRef<MediaStream | null>(null);
  const decodeur = useRef<Promise<Decodeur> | null>(null);
  const minuterie = useRef<number | undefined>(undefined);
  const dernierLu = useRef<string | null>(null);

  const obtenirDecodeur = () => (decodeur.current ??= creerDecodeur());

  const arreter = useCallback(() => {
    window.clearTimeout(minuterie.current);
    flux.current?.getTracks().forEach((t) => t.stop());
    flux.current = null;
    if (video.current) video.current.srcObject = null;
    setLampe({ dispo: false, allumee: false });
  }, []);

  // Renvoie vrai si le texte lu est un QR CODE-SECOURS (et lance l'ouverture de la page d'alerte).
  const traiter = useCallback(
    (texte: string) => {
      const jeton = extraireJeton(texte);
      if (!jeton) return false;
      arreter();
      vibrer(80);
      setEtat("trouve");
      router.push(`/s/${jeton}`);
      return true;
    },
    [arreter, router],
  );

  const boucle = useCallback(
    async (lire: Decodeur) => {
      const v = video.current;
      if (!flux.current || !v) return;
      if (v.readyState >= v.HAVE_CURRENT_DATA) {
        const texte = await lire(v);
        if (texte && !traiter(texte) && texte !== dernierLu.current) {
          // QR étranger : on prévient sans couper la caméra, puis on continue à chercher.
          dernierLu.current = texte;
          setAvis(ERREURS.etranger.message);
          window.setTimeout(() => {
            setAvis(null);
            dernierLu.current = null;
          }, DUREE_AVIS_MS);
        }
      }
      if (flux.current) minuterie.current = window.setTimeout(() => boucle(lire), INTERVALLE_SCAN_MS);
    },
    [traiter],
  );

  const demarrer = async () => {
    setErreur(null);
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErreur(ERREURS.nonSupporte);
      return;
    }
    setEtat("demarrage");
    try {
      const [s, lire] = await Promise.all([
        navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        }),
        obtenirDecodeur(),
      ]);
      flux.current = s;
      const v = video.current!;
      v.srcObject = s;
      await v.play();
      const piste = s.getVideoTracks()[0];
      const capacites = piste?.getCapabilities?.() as { torch?: boolean } | undefined;
      setLampe({ dispo: !!capacites?.torch, allumee: false });
      setEtat("scan");
      boucle(lire);
    } catch (e) {
      arreter();
      setEtat("repos");
      setErreur(erreurCamera(e));
    }
  };

  const basculerLampe = async () => {
    const piste = flux.current?.getVideoTracks()[0];
    if (!piste) return;
    const allumee = !lampe.allumee;
    try {
      await piste.applyConstraints({ advanced: [{ torch: allumee } as MediaTrackConstraintSet] });
      setLampe({ dispo: true, allumee });
    } catch {
      setLampe({ dispo: false, allumee: false });
    }
  };

  const fermer = () => {
    arreter();
    setAvis(null);
    setEtat("repos");
  };

  const importerPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0];
    e.target.value = "";
    if (!fichier) return;
    setErreur(null);
    try {
      const [image, lire] = await Promise.all([createImageBitmap(fichier), obtenirDecodeur()]);
      const texte = await lire(image);
      image.close();
      if (!texte) setErreur(ERREURS.photo);
      else if (!traiter(texte)) setErreur(ERREURS.etranger);
    } catch {
      setErreur(ERREURS.photo);
    }
  };

  // Caméra coupée quand la page passe en arrière-plan (batterie, voyant allumé) et en quittant la page.
  useEffect(() => {
    const surVisibilite = () => {
      if (document.hidden && flux.current) {
        arreter();
        setEtat("repos");
      }
    };
    document.addEventListener("visibilitychange", surVisibilite);
    return () => {
      document.removeEventListener("visibilitychange", surVisibilite);
      arreter();
    };
  }, [arreter]);

  const cameraVisible = etat === "demarrage" || etat === "scan";

  return (
    <section aria-labelledby="titre-scan" className="overflow-hidden rounded-3xl bg-white shadow-lg">
      <div className="p-6 pb-4 text-center">
        <h1 id="titre-scan" className="text-xl font-extrabold">Scannez un QR code CODE-SECOURS</h1>
        <p className="mt-2 text-attenue">
          Visez le QR code d'une plaque, d'un bracelet ou d'une carte APSIG : la page d'alerte s'ouvre aussitôt.
        </p>
      </div>

      {/* La vidéo reste montée pour que la référence existe au démarrage ; masquée au repos. */}
      <div className={cameraVisible ? "relative mx-4 aspect-square overflow-hidden rounded-2xl bg-encre" : "hidden"}>
        <video ref={video} playsInline muted autoPlay aria-hidden="true" className="size-full object-cover" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="viseur relative size-[68%]">
            {etat === "scan" && <span className="ligne-scan absolute inset-x-2 h-0.5 rounded-full bg-white/90" />}
          </div>
        </div>
        {etat === "demarrage" && (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm font-semibold text-white">Ouverture de la caméra…</p>
        )}
        {avis && (
          <p role="status" className="absolute inset-x-3 top-3 rounded-xl bg-alerte-fond px-3 py-2 text-center text-sm font-semibold text-alerte-encre">
            {avis}
          </p>
        )}
        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-3">
          {lampe.dispo && (
            <button
              type="button"
              onClick={basculerLampe}
              aria-pressed={lampe.allumee}
              aria-label={lampe.allumee ? "Éteindre la lampe" : "Allumer la lampe"}
              className={`grid size-12 place-items-center rounded-full backdrop-blur ${lampe.allumee ? "bg-white text-encre" : "bg-black/45 text-white"}`}
            >
              <Icone nom="lampe" className="size-5" />
            </button>
          )}
          {etat === "scan" && (
            <button
              type="button"
              onClick={fermer}
              aria-label="Fermer la caméra"
              className="grid size-12 place-items-center rounded-full bg-black/45 text-white backdrop-blur"
            >
              <Icone nom="croixFermer" className="size-5" />
            </button>
          )}
        </div>
      </div>

      {etat === "trouve" && (
        <div role="status" className="mx-4 grid justify-items-center gap-3 rounded-2xl bg-succes-fond px-4 py-8 text-center text-succes">
          <span className="grid size-14 place-items-center rounded-full bg-succes text-white">
            <Icone nom="coche" className="size-7" />
          </span>
          <p className="font-bold">QR code reconnu</p>
          <p className="text-sm">Ouverture de la page d'alerte…</p>
        </div>
      )}

      {etat === "repos" && (
        <div className="mx-4 grid justify-items-center rounded-2xl bg-fond px-4 py-8 text-brand">
          <Icone nom="qr" className="size-20" />
        </div>
      )}

      {erreur && (
        <div role="alert" className="mx-4 mt-4 flex gap-3 rounded-2xl bg-alerte-fond p-4 text-alerte-encre">
          <Icone nom="alerte" className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-bold">{erreur.titre}</p>
            <p className="text-sm">{erreur.message}</p>
          </div>
        </div>
      )}

      <div className="grid gap-2 p-4">
        {etat === "repos" && (
          <button
            type="button"
            onClick={demarrer}
            className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-brand text-lg font-bold text-white active:bg-brand/90"
          >
            <Icone nom="camera" />
            {erreur ? "Réessayer avec la caméra" : "Scanner avec la caméra"}
          </button>
        )}
        {etat !== "trouve" && (
          <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-2xl font-semibold text-brand ring-1 ring-ligne focus-within:ring-2 focus-within:ring-brand active:bg-brand-clair">
            <Icone nom="image" className="size-5" />
            Importer une photo du QR code
            <input type="file" accept="image/*" onChange={importerPhoto} className="sr-only" />
          </label>
        )}
        <p className="mt-1 text-center text-xs text-attenue">
          L'image reste sur votre téléphone : elle n'est ni enregistrée ni envoyée.
        </p>
      </div>
    </section>
  );
}
