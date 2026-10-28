# CODE-SECOURS CI — Cadrage

> APSIG — Agence de Protection et de Sécurité Intégrée du Golfe.
> Document vivant : il fixe les décisions prises et liste celles qui restent ouvertes.
> Sources : `docs/references/` (affiche, schéma fonctionnel, maquette V8, vidéo) et le prototype `reference/secour-v0.3/`.

## 1. Le service

Un témoin scanne le QR code d'un support (portail, intérieur, bracelet, carte). Une page web s'ouvre, **sans application à installer** : il choisit le type d'urgence et partage sa position. La centrale APSIG reçoit l'alerte, rappelle le témoin et le titulaire, puis met en relation la famille et les secours (Police, GSPM, SAMU, ambulance privée, infirmier).

APSIG **facilite la transmission** ; le service ne remplace pas les numéros publics d'urgence.

## 2. Modules

| # | Module | Rôle |
|---|---|---|
| 1 | **Foyers & abonnés** | Foyer, titulaire, membres, contacts d'urgence, adresse vérifiée, informations médicales (accès centrale uniquement) |
| 2 | **Supports & QR** | Génération des codes, jeton opaque, révocation, impression, pose, activation |
| 3 | **Page d'alerte** | Page mobile HTTPS ultra-légère : menu d'urgences selon le support, GPS, photo, vocal, suivi, annulation |
| 4 | **Alertes** | Cycle de vie, regroupement des doublons, score de fiabilité, escalade, chronologie |
| 5 | **Centrale** | Tableau de bord 24/7, carte temps réel, sirène, rappel témoin/titulaire, affectation, clôture |
| 6 | **Terrain** | Application des unités (APSIG, IDE motorisé) : mission, GPS, arrivée, clôture |
| 7 | **Communications** | SMS, WhatsApp, appels, USSD, SMS entrant ; pilotes interchangeables, journal des envois |
| 8 | **Partenaires & services** | Police, GSPM, SAMU, ambulance privée, IDE, sociétés de sécurité ; tarifs des prestations |
| 9 | **Formules & paiements** | Formules, abonnements, renouvellements, Mobile Money (webhooks signés) |
| 10 | **Installation** | Pose des supports par un agent : photo, GPS de pose → adresse vérifiée |
| 11 | **Espace client** | Suivi des alertes, gestion des proches, renouvellement |
| 12 | **Administration & rapports** | Opérateurs, rôles, paramètres, statistiques, exports |
| — | **Sécurité & conformité** (transverse) | Consentement GPS, chiffrement, audit, conservation, ARTCI |

## 3. Urgences (liste fusionnée schéma + maquette V8)

| Code | Bouton | Priorité | Routage par défaut |
|---|---|---|---|
| `agression` | SOS Agression / Vol / Intrusion | critique | Police, société de sécurité, titulaire, famille |
| `medical` | SOS Malaise / Maladie / Accident | haute | GSPM, SAMU, ambulance privée, titulaire, famille |
| `incendie` | SOS Incendie | critique | GSPM, titulaire, famille, voisinage |
| `egare` | SOS Enfant / Personne égarée | haute | Famille, puis Police si besoin |
| `soins` | Infirmier / Soins à domicile | normale (service payant) | IDE motorisé |
| `autre` | Autre situation | normale | Rappel du témoin par la centrale |

Bouton permanent : **« Je me suis trompé — Annuler »**.

### Menu selon le support scanné

| Support | Urgences proposées (dans l'ordre) |
|---|---|
| QR portail (extérieur) | agression, incendie, medical, autre |
| QR intérieur | medical, soins, incendie, agression |
| Bracelet enfant | egare, medical, autre |
| Carte voyageur | medical, agression, egare, autre |
| Carte véhicule | medical, agression, autre |

## 4. Supports

| Type | Code lisible | Adresse fixe | Référence de position |
|---|---|---|---|
| QR portail (extérieur) | `DAL-LOBIA-053` · `ABJ-YOP-NIANGON-453` | oui | adresse du foyer |
| QR intérieur | `INT-<NNNN>` | oui | adresse du foyer |
| Bracelet enfant | `ENF-<NNNN>-<NN>` | non | GPS du témoin |
| Carte voyageur | `VOY-<NNNN>` | non | GPS du témoin |
| Carte véhicule | `VEH-<NNNN>` | non | GPS du témoin |

Règles :
- **Code plaque adaptatif** : `VILLE-QUARTIER-NNN` pour une ville sans communes (Daloa), `VILLE-COMMUNE-QUARTIER-NNN` pour une ville découpée en communes (Abidjan).
- **Aucun numéro d'urgence imprimé sur les supports.** Les numéros des services (Police, GSPM, SAMU…) sont gérés dans la table des partenaires, côté centrale.
- Le QR encode **un jeton opaque** (`https://alerte.apsig.ci/s/<jeton>`), jamais le code lisible. Régénérer un QR révoque l'ancien (réponse « révoqué, appelez les secours »).
- La page publique n'affiche **jamais** le nom des personnes : seulement le type de support et, pour un support fixe, le quartier.
- Un abonnement expiré **n'empêche jamais** le traitement d'une urgence.

### QR extérieur vs QR intérieur

| | Extérieur — portail | Intérieur — domicile |
|---|---|---|
| Qui scanne | Passant, voisin (inconnu) | Famille, domestique, visiteur |
| Vocation | Sécurité, dissuasion | Santé, assistance |
| Présentation | Grande plaque aluminium, anti-UV, rivetée ; **uniquement le code plaque et le QR** | Petit format plexi blanc/argent, accent vert « Urgence santé — scannez ici » |
| Fiabilité | Contrôle distance GPS ↔ adresse, limitation de débit, rappel du témoin | Bonus de fiabilité (le scan vient de l'intérieur) |

## 5. Formules (pilote Daloa)

Modèle **achat + abonnement** : le prix d'achat paie les supports et la mise en service ; un abonnement mensuel finance ensuite la centrale 24/7.

| Formule | Achat | Contenu | Abonnement mensuel |
|---|---|---|---|
| Enfant | 3 000 F | Bracelet QR + enregistrement | à fixer |
| Maison | 7 500 F | Plaque + accès au service | à fixer |
| Famille complète | 15 000 F | Plaque + QR intérieur + bracelet + carte voyageur + 2 mois de service | à fixer |
| **Sécurité +** | à fixer | Formule à part : équipe d'intervention APSIG engagée en premier sur une agression | à fixer |

Un abonnement expiré ne bloque jamais une urgence.

Prestations payantes : ambulance (20 000 F abonné), IDE à domicile (5 000 F jour / 7 000 F nuit).

## 6. Stack

- Monorepo **pnpm + Turborepo**, TypeScript partout.
- `apps/api` — **NestJS** (un module Nest par module métier), temps réel SSE/Socket.IO.
- `apps/alerte` — page d'alerte **Next.js**, poids minimal (3G, Android d'entrée de gamme).
- `apps/centrale` — centrale, back-office, espace client, terrain : **Next.js + Tailwind + shadcn/ui + MapLibre**.
- `packages/domain` — règles métier pures, testées (urgences, routage, fiabilité, codes).
- `packages/db` — **Prisma 7 + PostgreSQL 18 + PostGIS**.
- **Redis + BullMQ** : envois SMS/appels, escalade, relances (survit aux redémarrages).
- **Better Auth** + double authentification pour la centrale.
- Docker, VPS, sauvegardes chiffrées hors site ; Sentry.

## 7. Décisions

Tranchées le 27/10/2026 :
- [x] **Numéros d'urgence** : aucun numéro imprimé sur les supports ; la plaque extérieure porte seulement le code et le QR.
- [x] **Code plaque** : format adaptatif (§4).
- [x] **Formules** : achat + abonnement mensuel (§5).
- [x] **Premium** : formule à part « Sécurité + » avec intervention APSIG.

Ouvertes :
- [ ] **Tarifs** : abonnement mensuel de chaque formule ; prix d'achat de « Sécurité + ».
- [ ] **Présentation du QR intérieur** : contenu exact imprimé (code `INT-…`, mention « Urgence santé » ?).
- [ ] **Conventions** avec Police, GSPM, SAMU pour la transmission automatique.
- [ ] **Fournisseurs** : agrégateur SMS/USSD, agrégateur Mobile Money, hébergeur.

## 8. Vidéo de présentation — corrections avant diffusion

Filigrane « 2KF Communication » à retirer ; textes IA erronés (« RECPIENCY », « POME-SECOURS », « GSPM 135 ») ; drapeau mexicain vers 1:44 ; ajouter sous-titres, numéro, tarifs et la mention « ne remplace pas les numéros d'urgence ».
