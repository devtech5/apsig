// Lecture des QR codes CODE-SECOURS depuis la caméra ou une photo, côté navigateur uniquement.

// Même alphabet que genererJeton (@apsig/domain), longueur acceptée par l'API.
const JETON = /^[A-Za-z0-9]{6,64}$/;

// Le QR encode https://alerte.apsig.ci/s/<jeton>. On n'en garde que le jeton :
// la navigation reste sur ce site, quel que soit le domaine imprimé (démo, préproduction).
export function extraireJeton(texte: string): string | null {
  let url: URL;
  try {
    url = new URL(texte.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const jeton = /^\/s\/([^/]+)\/?$/.exec(url.pathname)?.[1];
  return jeton && JETON.test(jeton) ? jeton : null;
}

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap;
export type Decodeur = (source: Source) => Promise<string | null>;

type BarcodeDetectorNatif = { detect(source: Source): Promise<{ rawValue: string }[]> };
type ClasseBarcodeDetector = {
  new (options: { formats: string[] }): BarcodeDetectorNatif;
  getSupportedFormats(): Promise<string[]>;
};

// Lecteur natif (Chrome Android) si disponible ; sinon jsQR (Safari iOS), chargé seulement à la demande.
export async function creerDecodeur(): Promise<Decodeur> {
  const Natif = (globalThis as { BarcodeDetector?: ClasseBarcodeDetector }).BarcodeDetector;
  if (Natif && (await Natif.getSupportedFormats().catch((): string[] => [])).includes("qr_code")) {
    const detecteur = new Natif({ formats: ["qr_code"] });
    return async (source) => (await detecteur.detect(source).catch(() => []))[0]?.rawValue ?? null;
  }

  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas indisponible");
  return async (source) => {
    const [l, h] =
      source instanceof HTMLVideoElement ? [source.videoWidth, source.videoHeight]
      : source instanceof HTMLImageElement ? [source.naturalWidth, source.naturalHeight]
      : [source.width, source.height];
    if (!l || !h) return null;
    // Réduit à 640 px de côté : assez pour un QR, léger pour un téléphone d'entrée de gamme.
    const echelle = Math.min(1, 640 / Math.max(l, h));
    canvas.width = Math.round(l * echelle);
    canvas.height = Math.round(h * echelle);
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
  };
}
