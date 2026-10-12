# Scénario de démonstration (≈ 10 minutes)

## Préparation (la veille ou 30 min avant)

1. `npm install` puis `npm run demo`. Notez l'URL `https://….trycloudflare.com` affichée.
2. Ouvrez sur le PC projeté : `http://localhost:3000/connexion` → **Superviseur** (accès rapide).
3. Sur un **téléphone** (autre appareil) : `https://…/connexion` → **Unité Alpha** pour l'application terrain.
4. Sur la centrale, **cliquez une fois n'importe où** pour autoriser la sirène et la voix.
5. Testez un scan avec votre propre téléphone, puis **Simuler ▸ Réinitialiser la démo**.

Plan B sans Internet : `npm run demo:local` (même Wi-Fi), et le menu **Simuler** de la centrale.

## Déroulé

| # | Écran | Action | Ce qu'on montre |
|---|---|---|---|
| 1 | Accueil | Présenter le concept, les plaques Bleu / Rouge | Adresse unique, QR, code USSD |
| 2 | Centrale | Vue d'ensemble | Carte d'Abidjan, 184 plaques, 8 unités, 2 interventions en cours |
| 3 | Centrale | **QR public** (bouton en haut) | La salle scanne avec l'appareil photo |
| 4 | Téléphone du public | **SOS Agression** | Sirène + voix « Alerte critique… », bandeau rouge, 6 acteurs notifiés |
| 5 | Téléphone | Accepter la géolocalisation, **Écrire** un message | Fiabilité qui monte, message dans la fiche |
| 6 | Centrale | Attendre 60 s sans agir (facultatif) | **Escalade N1** : bandeau, voix, SMS au superviseur |
| 7 | Centrale | Rappel titulaire : **Urgence confirmée** | Score de fiabilité +30 |
| 8 | Centrale | **Prendre en charge** puis **Affecter** (Alpha recommandée) | Mission transmise |
| 9 | Téléphone agent | Sonnerie → **Accepter la mission**, **Itinéraire** | GPS réel de l'unité sur la carte (violet) |
| 10 | Téléphone du public | — | « Équipe en route · arrivée estimée » en direct |
| 11 | Centrale / agent | **Je suis sur place** puis **Terminer** | Clôture, SMS au titulaire, journal horodaté |
| 12 | Centrale | Onglets **Messages**, **Rapports**, **Sécurité** | SMS émis, carte de chaleur, appareil suspect `d-7f3az9qk` à bloquer |
| 13 | `/ussd` | `*789*10002#` puis `1` | Alerte sans Internet, numéro identifié |
| 14 | `/client/demo` | Renouveler 12 mois via Wave | Paiement « en attente » puis confirmé |
| 15 | `/plaques` (admin) | Nouvelle plaque, régénérer un QR | Back-office complet |

## Astuces

- Le score de fiabilité n'empêche jamais une alerte : il aide l'opérateur à prioriser.
- Un numéro Mobile Money finissant par `0000` simule un solde insuffisant.
- Toute la démo se réinitialise en un clic (superviseur) : **Simuler ▸ Réinitialiser la démo**.
