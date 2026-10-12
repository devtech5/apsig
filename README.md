# CODE-SECOURS CI — Prototype APSIG

Prototype de démonstration : **plaque QR → page SOS → centrale de sécurité**, en temps réel.
Toutes les données (titulaires, numéros, établissements) sont **fictives**. Seules les communes d'Abidjan sont réelles.

## Lancer

```bash
npm install
npm start
```

Le terminal affiche les adresses utiles :

| Écran | URL |
|---|---|
| Accueil (vitrine + QR à scanner) | http://localhost:3000/ |
| Centrale de sécurité | http://localhost:3000/centrale |
| Parc de plaques (impression) | http://localhost:3000/plaques |
| Page SOS de la plaque de démo | http://<IP-du-PC>:3000/demo |

Les téléphones doivent être sur **le même Wi-Fi** que le PC. Au premier lancement, Windows peut demander d'autoriser Node.js sur le réseau : acceptez pour les **réseaux privés**.

### Options (variables d'environnement)

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port HTTP | `3000` |
| `PUBLIC_URL` | URL encodée dans les QR (ex. un tunnel `https://xxx.ngrok.app`) | `http://<IP LAN>:3000` |
| `DEMO` | `0` pour rendre les numéros d'urgence (170/180/185) cliquables | mode démo actif |
| `RATE_LIMIT` | Déclenchements max par minute et par IP | `6` |

## Scénario de démo (≈ 5 min)

1. **Accueil** (`/`) : présenter le concept et les deux plaques (Pass Bleu, Pass Rouge Premium).
2. **Centrale** (`/centrale`) sur le projecteur. *Cliquer une fois n'importe où* pour autoriser le son.
   Montrer les indicateurs, la carte (184 plaques, 8 unités) et les 2 interventions déjà en cours.
3. **Scan** : avec un téléphone, scanner le QR de l'accueil (ou de la plaque imprimée), puis appuyer sur **SOS Agression**.
   → Sirène, bandeau rouge « ALERTE CRITIQUE », alerte localisée sur la carte, 6 acteurs notifiés.
4. **Prendre en charge**, puis **Affecter une unité** (la plus proche est recommandée).
   → L'unité se déplace sur la carte ; le téléphone affiche « Équipe en route · arrivée estimée ».
5. Arrivée automatique « Sur place », puis **Clôturer** avec une issue.
   → Le téléphone affiche « Intervention terminée ».
6. **Historique** : traçabilité horodatée, graphique sur 8 jours, export CSV.

Plan B si le Wi-Fi fait défaut : menu **Simuler une alerte** de la centrale, et page SOS ouverte sur le PC (`/demo`).
**Réinitialiser la démo** (même menu) remet les données à zéro entre deux passages.

## Architecture

- `server.js` : serveur HTTP Node sans framework, API REST, temps réel par Server-Sent Events, QR en SVG.
- `src/seed.js` : jeu de données fictif déterministe (les QR restent valides d'un démarrage à l'autre).
- `src/store.js` : logique métier (routage par type d'urgence, affectation, cycle de vie, simulation GPS).
- `public/` : pages statiques (HTML/CSS/JS natifs) et Leaflet pour la carte.
- **Charte graphique** : toutes les couleurs, polices et rayons sont dans `public/css/theme.css` ; le logo est `public/img/logo-apsig.svg`.

Cycle d'une alerte : `nouvelle → prise_en_charge → en_route → sur_place → cloturee` (ou `annulee` par le témoin).

## Limites connues du prototype

- Données en mémoire : un redémarrage remet l'état initial.
- Pas d'authentification sur la centrale.
- Notifications SMS, WhatsApp et appels **simulés** (horodatés dans le journal).
- Déplacement des unités simulé et accéléré (~20 à 45 s).
- Fond de carte en ligne (Esri) : sans Internet, la carte reste fonctionnelle mais sans fond.
