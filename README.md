# APSIG — CODE-SECOURS CI

Plateforme de mise en relation d'urgence par QR code : un témoin scanne un support (portail, intérieur, bracelet, carte), la centrale APSIG reçoit l'alerte et mobilise la famille et les secours.

Cadrage, modules et décisions : [docs/CADRAGE.md](docs/CADRAGE.md).

## Architecture

```
Téléphone du témoin ──▶ apps/alerte (page Next.js) ─┐
        └──────────────── appels HTTPS ────────────┴▶ apps/api (serveur Node.js, NestJS) ──▶ PostgreSQL
Opérateur ──HTTPS──▶ apps/centrale (Next.js, relaie /api) ──▶        │                   ──▶ Redis (files d'envoi, à venir)
Abonné, agent, unité ──▶ apps/mobile (Expo) ── HTTPS ──────────▶│ ──▶ notifications Expo (push)
                                                            └──▶ SMS / appels / Mobile Money (à venir)
```

L'API est le **seul** composant qui accède à la base et aux fournisseurs : les pages web ne font qu'appeler l'API.

| Dossier | Contenu |
|---|---|
| `apps/api` | API NestJS (serveur) |
| `apps/alerte` | Page d'alerte ouverte par le scan (`/s/<jeton>`) : menu d'urgences, envoi, position suivie en continu avec aide vocale en cas de refus, suivi, annulation |
| `apps/centrale` | Back-office : centrale d'alertes (file en temps réel, sirène, carte, fiche, répartition), supervision, abonnements (foyers, supports, impression des QR), administration (comptes, journal d'audit) |
| `apps/mobile` | Application APSIG pour Android et iPhone (Expo, React Native) : SOS de l'abonné et suivi de son foyer, pose des QR par les agents (GPS = adresse vérifiée), missions des unités terrain, scan sans compte pour un témoin |
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
pnpm --filter @apsig/centrale start      # http://localhost:3002
```

Premier compte du back-office (il n'y a pas d'inscription) : `pnpm --filter @apsig/api creer-compte --email moi@apsig.ci --nom "Prénom Nom" --role SUPERADMIN`. Le mot de passe est généré et affiché une seule fois ; relancer la commande avec le seul `--email` en génère un nouveau et ferme les sessions ouvertes. Les comptes suivants se créent depuis la page Administration. La double authentification (application TOTP) est demandée à la première connexion ; `CENTRALE_2FA=facultatif` la rend facultative (développement uniquement).

La géolocalisation du témoin n'est disponible qu'en HTTPS (ou sur `localhost`) : pour tester depuis un vrai téléphone, passer par un tunnel HTTPS. Le navigateur ne donne jamais la position sans l'accord du témoin : la page la redemande avec une aide en pictogrammes et à voix haute, et un refus est signalé à la centrale pour qu'elle rappelle.

Tests : `pnpm test` (la base `apsig_test` est créée et migrée automatiquement).

### Application mobile

```bash
pnpm --filter @apsig/mobile web          # aperçu dans le navigateur : http://localhost:8081
pnpm --filter @apsig/mobile start        # QR à scanner avec Expo Go (même réseau Wi-Fi)
pnpm --filter @apsig/mobile typecheck
```

L'adresse de l'API est intégrée au build : `EXPO_PUBLIC_API_URL` dans `apps/mobile/.env.local` en développement (`http://<IP du PC>:4000` pour un vrai téléphone), et dans `apps/mobile/eas.json` pour les builds. Ajouter `http://localhost:8081` à `CORS_ORIGINS` pour l'aperçu web.

Trois parcours dans une seule application :

- **Abonné** : le conseiller génère un code à 8 chiffres depuis la fiche du foyer (72 h, 5 essais) ; le membre l'entre avec son numéro de téléphone. Le téléphone devient un support `APP-NNNN-RR` : SOS avec position GPS et aide vocale, suivi des alertes du foyer, notifications à la famille à chaque alerte et à chaque étape. Le conseiller voit les téléphones reliés et peut les déconnecter.
- **Agent de pose** (rôles agent, conseiller, administrateur) : connexion par e-mail, mot de passe et code TOTP ; scan du QR posé, la position relevée (précision ≤ 50 m) devient l'adresse vérifiée du foyer.
- **Intervenant** d'une unité terrain : prise de service, missions engagées par l'opérateur (adresse, itinéraire, appel du témoin), étapes en route / sur place / terminée, position envoyée à la centrale toutes les 30 s.

Builds Android et iOS dans le cloud avec EAS (pas besoin d'Android Studio ni de Xcode) : `npx eas-cli@latest build --profile preview --platform android` (APK à installer), `--profile production` pour les stores. Les notifications push passent par le service Expo : `EXPO_ACCESS_TOKEN` (facultatif) côté API, `EXPO_PUSH=inactif` les coupe (tests).

## API publique (page d'alerte)

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/sante` | État du serveur et de la base |
| `GET` | `/public/supports/:jeton` | Ce que voit le témoin après le scan : type de support, quartier (support fixe), menu d'urgences |
| `POST` | `/public/alertes` | Déclenche une alerte `{ jeton, type, appareilId?, position?, problemePosition? }` → `numero`, `cleTemoin` |
| `GET` | `/public/alertes/:numero?cle=` | Suivi de l'alerte par le témoin |
| `POST` | `/public/alertes/:numero/position` | Partage de la position `{ cle, position }`, renvoyée à chaque déplacement |
| `POST` | `/public/alertes/:numero/position/probleme` | `{ cle, probleme: REFUSEE \| INDISPONIBLE }` : la centrale doit rappeler le témoin |
| `POST` | `/public/alertes/:numero/annuler` | Annulation `{ cle }` (tant qu'aucune unité n'est sur place) |

Garanties : aucune donnée personnelle sur les routes publiques, jeton opaque révocable (410), limitation à 6 déclenchements par minute et par IP, regroupement des doublons, une urgence n'est jamais refusée pour un abonnement expiré.

## API de la centrale

Connexion par e-mail et mot de passe puis code TOTP (Better Auth, routes `/api/auth/*`, session de 12 h en cookie, compte actif obligatoire). `GET /compte` renvoie le compte connecté et ses espaces ; chaque espace est un groupe de routes réservé à certains rôles :

| Espace | Routes | Rôles |
|---|---|---|
| Centrale | `/centrale/*` : flux temps réel (SSE), file, fiche, prise en charge, statut, rappel, notes, présence, alerte suivante | Opérateur, superviseur, administrateur, super-administrateur |
| Supervision | `/supervision/*` : historique filtré, statistiques (délais médians, par type, par opérateur, par jour), équipe ; réattribution depuis la centrale | Superviseur, administrateur, super-administrateur |
| Abonnements | `/abonnements/*` : foyers, membres, contacts, formules, paiements, supports et remplacement des QR | Conseiller abonnements, administrateur, super-administrateur |
| Administration | `/administration/*` : comptes (création, rôle, unité, désactivation, réinitialisation), unités terrain, journal d'audit | Administrateur (rôles inférieurs au sien), super-administrateur |
| Pose (mobile) | `/pose/*` : QR à poser, fiche d'un QR scanné, pose avec position GPS | Agent de pose, conseiller, administrateur, super-administrateur |
| Terrain (mobile) | `/terrain/*` : unité et missions, étapes, position, disponibilité | Intervenant |

L'application des abonnés n'utilise pas de compte back-office : `/client/activation` échange le code du conseiller contre un jeton d'accès (`Authorization: Bearer`), puis `/client/moi`, `/client/sos`, `/client/alertes`, `/client/notifications`, `/client/session`. Aucune donnée de santé n'y est renvoyée. L'opérateur engage une unité depuis la fiche d'alerte (`POST /centrale/alertes/:numero/unite`).

Les alertes sont attribuées automatiquement aux opérateurs en service (rattrapage si l'opérateur ne la prend pas), sauf en mode crise où chacun prend la suivante, la plus urgente d'abord. Chaque action est inscrite au journal de l'alerte et dans la table `Audit`.

## Déploiement (Dokploy)

Trois applications Dokploy, construites depuis ce dépôt (branche `main`) avec **Build Type : Dockerfile** et **Docker Context Path : `.`** (racine du monorepo), plus une base PostgreSQL Dokploy.

| Application | Dockerfile | Port | Domaine |
|---|---|---|---|
| API | `Dockerfile` (racine, valeur par défaut ; copie de `apps/api/Dockerfile`) | 4000 | `api.<domaine>` |
| Page d'alerte | `apps/alerte/Dockerfile` | 3001 | `alerte.<domaine>` (URL encodée dans les QR) |
| Centrale | `apps/centrale/Dockerfile` | 3002 | `centrale.<domaine>` |

Variables de l'**API** (les migrations sont appliquées à chaque démarrage) :

```env
DATABASE_URL=<Internal Connection URL de la base Dokploy>
NODE_ENV=production
API_PORT=4000
TRUST_PROXY=1
RATE_LIMIT_ALERTES=6
PUBLIC_ALERT_URL=https://alerte.<domaine>
CORS_ORIGINS=https://alerte.<domaine>
CENTRALE_URL=https://centrale.<domaine>
BETTER_AUTH_SECRET=<openssl rand -base64 32>
EXPO_ACCESS_TOKEN=<facultatif : jeton d'accès Expo si la sécurité des notifications push est activée>
```

Sans `BETTER_AUTH_SECRET`, l'API démarre quand même (les alertes passent avant tout), mais les opérateurs sont déconnectés à chaque redémarrage. Sans `CENTRALE_URL` exacte, la connexion à la centrale est refusée. La double authentification est obligatoire : ne jamais définir `CENTRALE_2FA` en production.

**Page d'alerte** : `NEXT_PUBLIC_API_URL=https://api.<domaine>` en **build argument** (elle est intégrée au build : la changer impose un redéploiement). En option, `API_INTERNAL_URL` en variable d'environnement pour que le serveur de la page joigne l'API par le réseau interne.

**Centrale** : `CENTRALE_API_URL=https://api.<domaine>` en **build argument** (adresse de l'API vue par le serveur de la centrale, qui lui relaie `/api/auth`, `/api/compte` et un `/api/<espace>` par espace). Premier compte, depuis le terminal Dokploy du conteneur de l'API : `node apps/api/dist/auth/creer-compte.js --email … --nom "…" --role SUPERADMIN`.

Vérification : `https://api.<domaine>/sante` doit répondre `{ "statut": "ok", "base": "ok", … }`.
