# APSIG — CODE-SECOURS CI

Plateforme de mise en relation d'urgence par QR code : un témoin scanne un support (portail, intérieur, bracelet, carte), la centrale APSIG reçoit l'alerte et mobilise la famille et les secours.

Cadrage, modules et décisions : [docs/CADRAGE.md](docs/CADRAGE.md).

## Architecture

```
Téléphone du témoin ──▶ apps/alerte (page Next.js) ─┐
        └──────────────── appels HTTPS ────────────┴▶ apps/api (serveur Node.js, NestJS) ──▶ PostgreSQL
Centrale (navigateur) ──HTTPS──────────────────────▶        │                          ──▶ Redis (files d'envoi, à venir)
                                                            └──▶ SMS / appels / Mobile Money (à venir)
```

L'API est le **seul** composant qui accède à la base et aux fournisseurs : les pages web ne font qu'appeler l'API.

| Dossier | Contenu |
|---|---|
| `apps/api` | API NestJS (serveur) |
| `apps/alerte` | Page d'alerte ouverte par le scan (`/s/<jeton>`) : menu d'urgences, envoi, position, suivi, annulation |
| `packages/domain` | Règles métier pures et testées : urgences, menus par support, codes, fiabilité, cycle de vie |
| `packages/db` | Schéma Prisma, migrations, données de démonstration |
| `docs/` | Cadrage ; `docs/references/` : affiche, schéma, maquette V8, vidéo |
| `reference/secour-v0.3` | Prototype de démonstration d'origine (lecture seule, hors workspace) |

## Démarrage

Prérequis : Node.js 22+, pnpm, Docker Desktop lancé.

```bash
pnpm install
cp .env.example .env
pnpm services:up                         # PostgreSQL (port 55432) + Redis (port 6380)
pnpm --filter @apsig/db run deploy       # applique les migrations
pnpm --filter @apsig/db seed             # données fictives + URLs des QR de démo
pnpm build
pnpm --filter @apsig/api start           # http://localhost:4000
pnpm --filter @apsig/alerte start        # http://localhost:3001 (ouvrir une URL de QR affichée par le seed)
```

La géolocalisation du témoin n'est disponible qu'en HTTPS (ou sur `localhost`) : pour tester depuis un vrai téléphone, passer par un tunnel HTTPS.

Tests : `pnpm test` (la base `apsig_test` est créée et migrée automatiquement).

## API publique (page d'alerte)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/sante` | État du serveur et de la base |
| `GET` | `/public/supports/:jeton` | Ce que voit le témoin après le scan : type de support, quartier (support fixe), menu d'urgences |
| `POST` | `/public/alertes` | Déclenche une alerte `{ jeton, type, appareilId?, position? }` → `numero`, `cleTemoin` |
| `GET` | `/public/alertes/:numero?cle=` | Suivi de l'alerte par le témoin |
| `POST` | `/public/alertes/:numero/position` | Partage de la position `{ cle, position }` |
| `POST` | `/public/alertes/:numero/annuler` | Annulation `{ cle }` (tant qu'aucune unité n'est sur place) |

Garanties : aucune donnée personnelle sur les routes publiques, jeton opaque révocable (410), limitation à 6 déclenchements par minute et par IP, regroupement des doublons, une urgence n'est jamais refusée pour un abonnement expiré.

## Déploiement (Dokploy)

Deux applications Dokploy, construites depuis ce dépôt (branche `main`) avec **Build Type : Dockerfile** et **Docker Context Path : `.`** (racine du monorepo), plus une base PostgreSQL Dokploy.

| Application | Dockerfile | Port | Domaine |
|---|---|---|---|
| API | `Dockerfile` (racine, valeur par défaut ; copie de `apps/api/Dockerfile`) | 4000 | `api.<domaine>` |
| Page d'alerte | `apps/alerte/Dockerfile` | 3001 | `alerte.<domaine>` (URL encodée dans les QR) |

Variables de l'**API** (les migrations sont appliquées à chaque démarrage) :

```env
DATABASE_URL=<Internal Connection URL de la base Dokploy>
NODE_ENV=production
API_PORT=4000
TRUST_PROXY=1
RATE_LIMIT_ALERTES=6
PUBLIC_ALERT_URL=https://alerte.<domaine>
CORS_ORIGINS=https://alerte.<domaine>
```

**Page d'alerte** : `NEXT_PUBLIC_API_URL=https://api.<domaine>` en **build argument** (elle est intégrée au build : la changer impose un redéploiement). En option, `API_INTERNAL_URL` en variable d'environnement pour que le serveur de la page joigne l'API par le réseau interne.

Vérification : `https://api.<domaine>/sante` doit répondre `{ "statut": "ok", "base": "ok", … }`.
