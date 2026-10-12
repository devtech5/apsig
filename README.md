# CODE-SECOURS CI — Prototype APSIG v0.3

**Plaque QR → page SOS → centrale de sécurité → unités terrain**, en temps réel, avec accès sans Internet (USSD/SMS).
Toutes les données (titulaires, numéros, établissements, paiements) sont **fictives**. Seules les communes d'Abidjan sont réelles.

## Démarrage rapide

```bash
npm install
npm run demo
```

`npm run demo` repart de données propres **et** ouvre un tunnel HTTPS public (Cloudflare) : les téléphones du public fonctionnent depuis **n'importe quel réseau** (4G, Wi-Fi invité qui isole les appareils…), avec géolocalisation et micro. Le terminal affiche l'adresse `https://….trycloudflare.com`, qui est automatiquement encodée dans les QR codes.

| Commande | Usage |
|---|---|
| `npm run demo` | Démo : compilation du front, données réinitialisées + tunnel HTTPS (nécessite `cloudflared`) |
| `npm run demo:local` | Démo sur le Wi-Fi local uniquement (téléphones sur le même réseau) |
| `npm run dev` | Développement : rechargement à chaud du front (Next.js) |
| `npm run build` puis `npm start` | Production : conserve les données entre deux lancements (base SQLite dans `data/`) |
| `npm run api` | API seule, sans front (back-end d'un front déployé sur Vercel) |
| `npm test` | 30 tests automatisés (métier + API) |
| `npm run backup` | Sauvegarde à chaud de la base |

## Pile technique

- **Front-end** : [Next.js 16](https://nextjs.org) (App Router) + React 19, **Tailwind CSS v4**, Leaflet pour les cartes. Code dans `app/` (routes), `components/` (écrans et composants d'interface), `lib/` (API, temps réel, formats).
- **Back-end** : Node.js ≥ 22.13 sans framework (`src/`), SQLite intégré (`node:sqlite`), temps réel par Server-Sent Events avec repli en long polling.
- **Un seul processus, un seul port** : `server.js` sert l'API et délègue le rendu des pages à Next.js (compatible tunnel, réseau local et Docker).
- **Déploiement séparé possible** : front sur Vercel (`BACKEND_URL` = adresse de l'API), API sur un hébergeur Node persistant (`npm run api`). Voir [Architecture](docs/ARCHITECTURE.md).

Installer le tunnel (une seule fois, Windows) : `winget install Cloudflare.cloudflared`.

## Les interfaces

| Écran | Adresse | Accès |
|---|---|---|
| Accueil (vitrine, QR à scanner) | `/` | public |
| Page SOS d'une plaque | `/s/<jeton>` — raccourci `/demo` | public |
| Connexion | `/connexion` | — |
| Centrale de sécurité | `/centrale` | opérateur, superviseur, admin |
| Back-office des plaques | `/plaques` | consultation : opérateur · gestion : admin |
| Application terrain | `/terrain` | agents des unités |
| Espace client | `/client/<clé privée>` — démo `/client/demo` | lien envoyé par SMS au titulaire |
| Simulateur USSD / SMS | `/ussd` | public (démo) |

### Comptes de démonstration (fictifs)

En mode démo, la page de connexion propose un **accès rapide** en un clic. Les mots de passe de test :

| Identifiant | Rôle | Mot de passe |
|---|---|---|
| `admin` | Administrateur | `Admin#2026` |
| `superviseur` | Superviseur | `Superviseur#2026` |
| `operateur`, `operateur2` | Opérateur | `Operateur#2026` |
| `agent.alpha` … `agent.rouge2` | Agent terrain (une unité chacun) | `Terrain#2026` |

> Un navigateur ne garde qu'une session : pour montrer la centrale **et** l'application terrain en même temps, ouvrez le terrain sur un autre appareil (téléphone) ou une fenêtre de navigation privée.

## Fonctionnalités

**Page SOS (témoin)**
- Adresse vérifiée, 3 boutons (agression, malaise, incendie), un seul appui.
- Suivi en direct : prise en charge, unité en route avec ETA, arrivée, clôture ; annulation possible.
- Français / anglais, **lecture audio** des instructions et des consignes.
- **Position du témoin** (HTTPS), **photo**, **message vocal** (30 s), message texte.
- Code USSD de secours affiché ; numéros d'urgence (non composables en mode démo).

**Centrale**
- Carte temps réel (plaques, unités, trajets, témoin), file d'alertes, **sirène + annonce vocale**.
- **Escalade automatique** : N1 (superviseur, SMS) à 60 s, N2 (responsable, appel) à 120 s sans prise en charge.
- **Score de fiabilité** expliqué (position du témoin, appareil, rappel du titulaire, pièces jointes…).
- **Rappel automatique du titulaire** (appel vocal) et saisie du résultat.
- Affectation recommandée (unité la plus proche ; équipe armée pour Pass Rouge + agression).
- Onglets **Historique** (30 jours, filtres, CSV), **Rapports** (carte de chaleur, par commune/jour/heure, impression),
  **Messages** (tous les SMS/WhatsApp/appels émis), **Sécurité** (appareils suspects, blocage, journal d'audit, sauvegarde).
- **QR public plein écran** pour faire scanner la salle.

**Application terrain** : mission reçue avec sonnerie et vibration, acceptation, itinéraire Google Maps, **GPS réel** (arrivée détectée à moins de 80 m), clôture sur place.

**Espace client** : alertes à son adresse en direct, notifications du navigateur, gestion des proches à prévenir, **renouvellement Mobile Money** (Orange Money, MTN MoMo, Moov Money, Wave — simulé).

**Back-office** : création de plaque (code `ABJ-COMMUNE-QUARTIER-NNN` + code USSD), modification, **régénération du QR** (l'ancien est révoqué), désactivation, encaissements, historique des paiements, impression.

**Sans Internet** : `*789*CODE#` (USSD) ou SMS « `SOS CODE 1` ». Points d'entrée compatibles avec les passerelles d'agrégateurs (`POST /api/ussd`, `POST /api/sms/inbound`).

## Configuration

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port HTTP | `3000` |
| `PUBLIC_URL` | URL publique encodée dans les QR (prioritaire sur le tunnel) | tunnel, sinon IP locale |
| `TUNNEL` | `1` pour ouvrir le tunnel sans `--tunnel` | — |
| `DEMO` | `0` = production (numéros cliquables, pas d'accès rapide) | démo |
| `DATA_DIR` / `DB_FILE` | Emplacement des données | `./data` |
| `ESCALATION_SECONDS` | Seuils d'escalade N1,N2 | `60,120` |
| `RATE_LIMIT` | Déclenchements max par minute et par IP | `6` |
| `RETENTION_DAYS` / `MEDIA_RETENTION_DAYS` | Anonymisation des alertes / suppression des médias | `365` / `90` |
| `NOTIFY_DRIVER` | Pilote de messagerie (`simulation`, `console`) | `simulation` |

Docker : `docker compose up -d` (voir `docker-compose.yml`).

## Charte graphique

Toutes les couleurs, polices, rayons et ombres sont des jetons Tailwind centralisés dans [`app/globals.css`](app/globals.css) (blocs `:root`, `.theme-dark` et `@theme`) ; le logo provisoire est [`public/img/logo-apsig.svg`](public/img/logo-apsig.svg). L'application de la charte officielle se fait dans ces deux fichiers.

## Documentation

- [Scénario de démonstration](docs/DEMO.md)
- [Architecture et passage en production](docs/ARCHITECTURE.md)
- [Conformité et protection des données](docs/CONFORMITE.md)

## Limites connues du prototype

- SMS, WhatsApp, appels, Mobile Money et USSD opérateur sont **simulés** (interfaces prêtes pour de vrais fournisseurs).
- Les tunnels rapides Cloudflare ne transmettent pas les Server-Sent Events : le navigateur bascule alors automatiquement en long polling (transparent pour l'utilisateur).
- Langues locales (dioula, baoulé…) à produire avec des traducteurs natifs et des enregistrements audio.
- Notifications push en arrière-plan (Web Push) : prévues, non incluses.
- Fond de carte : Esri par défaut, avec repli automatique sur OpenStreetMap si le réseau bloque Esri.
