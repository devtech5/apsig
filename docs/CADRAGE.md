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

## 5. Forfaits

Tarif de lancement fixé le 11/11/2026 : **un forfait unique**. L'**abonnement** de **10 000 F** est payé à l'entrée et **n'est pas remboursable** (supports et mise en service) ; un **acompte** est possible au recensement, l'abonnement s'ouvre quand le solde est payé ; la **mensualité** finance ensuite la centrale 24/7 et dépend du client.

| Client | Abonnement | Mensualité |
|---|---|---|
| **Particulier** | 10 000 F | 2 000 F/mois |
| **Famille** | 10 000 F | 5 000 F/mois |
| **Entreprise et autres** (ONG, mutuelle…) | 10 000 F | 10 000 F/mois |

Le client pourra ajouter des **options** plus tard, en supplément du forfait. La commission du mandataire reste à 1 000 F par plaque posée.

Source unique dans le code : `packages/domain/src/forfaits.ts` (trois formules `UNIQUE_PARTICULIER`, `UNIQUE_FAMILLE`, `UNIQUE_ENTREPRISE`).

Le **premier mois est compris** dans l'abonnement ; la mensualité court dès le deuxième mois. **Provisoire** : supports fournis = plaque + QR intérieur.

Les inscriptions en ligne (`code-secours.apsig.online`, `apps/inscription`) déposent une demande sans paiement ; un conseiller rappelle.

**Inscription en deux temps** (précisée le 13/11/2026) :
1. **Recensement** par un agent de terrain (centrale web `/recensement`, puis application mobile) : type de client ; pour une entreprise ou une autre organisation, numéro du registre du commerce (RCCM) ; nom, prénoms, téléphone 1, téléphone 2 (facultatif), ville / commune / quartier du référentiel APSIG, adresse ou repère le plus précis possible ; encaissement des 10 000 F ou « pas encore payé ». À la validation, le **code Code-Secours** (code de la plaque, `DAL-LOBIA-053`) et les **QR** (plaque et intérieur) sont générés.
2. **Pose de la plaque** (centrale web `/pose`), qui conclut l'inscription : code de la plaque, personne à contacter (nom et prénoms du représentant présent), position GPS relevée sur place **à 5 m près**, photo de la plaque posée et photo de la remise des codes QR. Les preuves sont visibles dans la fiche du foyer.

**Trois sites** (décidés le 14/11/2026), une même application web :
- `centrale.apsig.online` : le personnel qui reçoit et traite les alertes (centrale, carte, supervision) ;
- `code-secours.apsig.online` : le terrain. Recenseurs et chefs d'équipe recensent ; les poseurs voient les clients à équiper de **leurs communes** (zones attribuées par le chef d'équipe ou le QG) et concluent l'inscription. Le formulaire public d'inscription est supprimé ;
- `base.apsig.online` : le QG. Personnel (comptes, équipes, journal), abonnements, finance (encaissements, soldes, mensualités, commissions), forfaits (création, prix, retrait, migration des abonnés), prestataires et intervenants.

Travail dissocié : le recenseur recense, le poseur pose. Recenseurs et poseurs se connectent au téléphone, sans double authentification.

**Accès terrain** (décidés le 13/11/2026) :

| Rôle | Recensement (étape 1) | Pose (étape 2) | Équipe | Connexion |
|---|---|---|---|---|
| **Recenseur** | ses propres clients seulement | non | non | téléphone + mot de passe, sans double authentification |
| **Poseur de plaques** | oui | oui ; le code de la plaque indique le recenseur | non | e-mail + mot de passe + double authentification |
| **Chef d'équipe terrain** | oui | oui | crée et gère les comptes de ses recenseurs, suit recensés / payés / plaques posées | e-mail + mot de passe + double authentification |
| **Administrateur** | oui | oui | tout le terrain ; crée tous les comptes, rattache un recenseur à un chef | e-mail + mot de passe + double authentification |


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

Tranchées le 11/11/2026 :
- [x] **Forfait unique de lancement** : 10 000 F à l'entrée, premier mois compris ; mensualité de 2 000 F (particulier), 5 000 F (famille), 10 000 F (entreprise et autres organisations) ; options ajoutées plus tard (§5). Remplace la grille Bronze / Gold / Premium du matin même, les formules Enfant, Maison, Famille complète et Sécurité +, ainsi que la grille Standard / Premium des documents terrain du 04/11.
- [x] **Abonnement** : non remboursable. Depuis le 13/11/2026, le client peut verser un **acompte (avance)** au recensement ; l'abonnement s'ouvre au paiement du solde (décision du 11/11 « en une seule fois » levée).
- [x] **Lieux** : listes des villes de Côte d'Ivoire (`packages/domain/src/lieux.ts`) et des communes d'Abidjan ; une ville, une commune ou un quartier absent est ajouté au référentiel au recensement.
- [x] **Mandataires** : indépendants, non salariés d'APSIG ; commission due à la pose validée de la plaque.

Ouvertes :
- [ ] **Contenu du forfait unique** : supports fournis, nombre de membres ; liste et prix des options ; quelle option engage l'équipe d'intervention APSIG sur une agression (ex-« Sécurité + »).
- [ ] **Numéros sur la plaque** : les maquettes du 06/11 impriment Police 111, GSPM 180 et le numéro APSIG, contre la décision du 27/10.
- [ ] **Code plaque** : les maquettes portent `PB-GONZA-453`, hors du format adaptatif (§4).
- [ ] **Zone pilote** : Daloa, Gonzagueville (Port-Bouët) et Anyama Belleville apparaissent selon les documents.
- [ ] **Présentation du QR intérieur** : contenu exact imprimé (code `INT-…`, mention « Urgence santé » ?).
- [ ] **Conventions** avec Police, GSPM, SAMU pour la transmission automatique.
- [ ] **Fournisseurs** : agrégateur SMS/USSD, agrégateur Mobile Money, hébergeur.

## 8. Vidéo de présentation — corrections avant diffusion

Filigrane « 2KF Communication » à retirer ; textes IA erronés (« RECPIENCY », « POME-SECOURS », « GSPM 135 ») ; drapeau mexicain vers 1:44 ; ajouter sous-titres, numéro, tarifs et la mention « ne remplace pas les numéros d'urgence ».
