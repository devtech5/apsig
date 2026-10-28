# APSIG — CODE-SECOURS CI

Plateforme de mise en relation d'urgence par QR code : un témoin scanne un support (portail, intérieur, bracelet, carte), la centrale APSIG reçoit l'alerte et mobilise la famille et les secours.

Cadrage, modules et décisions : [docs/CADRAGE.md](docs/CADRAGE.md).

## Architecture

```
Téléphone du témoin ──HTTPS──▶ apps/api (serveur Node.js, NestJS) ──▶ PostgreSQL
Centrale (navigateur) ──HTTPS──▶        │                          ──▶ Redis (files d'envoi, à venir)
                                        └──▶ SMS / appels / Mobile Money (à venir)
```

L'API est le **seul** composant qui accède à la base et aux fournisseurs : les pages web ne font qu'appeler l'API.

| Dossier | Contenu |
|---|---|
| `apps/api` | API NestJS (serveur) |
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
```

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
