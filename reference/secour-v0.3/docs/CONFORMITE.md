# Conformité et protection des données

> Document de travail, à valider avec un conseil juridique. Il ne constitue pas un avis juridique.

## Cadre

En Côte d'Ivoire, le traitement de données à caractère personnel est encadré par la **loi n° 2013-450 du 19 juin 2013** relative à la protection des données à caractère personnel. L'autorité de contrôle est l'**ARTCI** (Autorité de Régulation des Télécommunications/TIC de Côte d'Ivoire).

Code-Secours traite notamment : identité et téléphone des titulaires et de leurs proches, adresses et coordonnées GPS, positions des témoins et des unités, photos et messages vocaux, historique des alertes, données de paiement.

## Points d'action avant mise en service

- [ ] **Formalités auprès de l'ARTCI** (déclaration ou demande d'autorisation selon la nature des traitements, en particulier la géolocalisation).
- [ ] **Information des personnes** : mentions sur la page SOS, au contrat d'abonnement, dans l'espace client.
- [ ] **Consentement** des proches enregistrés comme contacts (le titulaire doit les en informer).
- [ ] **Registre des traitements** et désignation d'un responsable.
- [ ] **Contrats de sous-traitance** avec l'hébergeur, l'agrégateur SMS/USSD et l'agrégateur de paiement.
- [ ] **Transferts hors de Côte d'Ivoire** (hébergement, tunnel, fournisseurs) : vérifier les conditions applicables.
- [ ] **Procédure de violation de données** (détection, notification, information).
- [ ] **Droits des personnes** (accès, rectification, opposition, suppression) : procédure et délai de réponse.

## Mesures déjà présentes dans le prototype

| Principe | Mise en œuvre |
|---|---|
| Minimisation | La page SOS publique n'expose ni titulaire ni contacts ; l'appareil du témoin est un identifiant pseudonyme aléatoire |
| Durées de conservation | Anonymisation automatique des alertes après `RETENTION_DAYS` (365 j) : appareil, numéro et position du témoin effacés ; médias supprimés après `MEDIA_RETENTION_DAYS` (90 j) |
| Sécurité | Mots de passe hachés (scrypt), sessions `HttpOnly`, contrôle d'accès par rôle, limitation de débit, contrôle des fichiers |
| Traçabilité | Journal d'audit (connexions, actions opérateurs, plaques, paiements, blocages, réinitialisations) |
| Accès restreint | Photos et messages vocaux visibles uniquement par la centrale authentifiée |
| Sauvegardes | Sauvegarde quotidienne, 7 versions conservées |

## Points d'attention éthiques

- **Aucune alerte n'est jamais rejetée automatiquement** : le score de fiabilité et le blocage d'appareil aident à prioriser, sans priver quiconque de secours.
- Le blocage d'un appareil est réservé aux superviseurs, motivé et tracé dans le journal d'audit.
- L'abonnement expiré n'empêche pas le traitement d'une urgence.
