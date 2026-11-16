// Service worker de l'espace terrain (op.<domaine>, PWA).
// Rien n'est mis en cache des pages ni des données des clients : chaque page est demandée au réseau.
// Sans réseau, une page « Pas de connexion » s'affiche au lieu de l'erreur du navigateur.
const CACHE = "apsig-terrain-v1";
const HORS_LIGNE = "/hors-ligne";

// La page de secours et ses fichiers (styles, logo), relevés dans son HTML à l'installation.
async function preparerHorsLigne() {
  const cache = await caches.open(CACHE);
  const reponse = await fetch(HORS_LIGNE, { cache: "no-store" });
  if (!reponse.ok) throw new Error(`Page hors ligne indisponible (${reponse.status})`);
  const html = await reponse.clone().text();
  const fichiers = [...new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? [])];
  await cache.put(HORS_LIGNE, reponse);
  await cache.addAll(["/logo-apsig.svg", ...fichiers]);
}

self.addEventListener("install", (evenement) => {
  evenement.waitUntil(preparerHorsLigne().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (evenement) => {
  evenement.waitUntil(
    caches
      .keys()
      .then((cles) => Promise.all(cles.filter((cle) => cle !== CACHE).map((cle) => caches.delete(cle))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evenement) => {
  const requete = evenement.request;
  if (requete.method !== "GET") return;
  // Navigation : toujours le réseau ; la page de secours seulement s'il ne répond pas.
  if (requete.mode === "navigate") {
    evenement.respondWith(fetch(requete).catch(() => caches.match(HORS_LIGNE)));
    return;
  }
  // Fichiers de la page de secours (noms uniques par version) : servis depuis le cache s'il les a.
  const url = new URL(requete.url);
  if (url.origin === self.location.origin && (url.pathname.startsWith("/_next/static/") || url.pathname === "/logo-apsig.svg")) {
    evenement.respondWith(caches.match(requete).then((enCache) => enCache ?? fetch(requete)));
  }
});
