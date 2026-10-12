# Architecture et passage en production

## Vue d'ensemble du prototype

```
Téléphones (page SOS, terrain, espace client)      PC centrale (supervision)
        │  HTTPS / long polling ou SSE                    │ SSE
        ▼                                                 ▼
┌──────────────────────────── server.js (Node, sans framework) ─────────────────────────────┐
│ Next.js 16     pages React + Tailwind (app/, components/, lib/), rendu délégué par app.js     │
│ src/app.js     routes, droits par rôle, temps réel (SSE + repli long polling), médias        │
│ src/store.js   métier : alertes, routage, escalade, unités, plaques, abonnements, rapports   │
│ src/trust.js   score de fiabilité        src/notify.js  messagerie (pilotes)                 │
│ src/auth.js    comptes, sessions (scrypt) src/db.js      persistance SQLite (node:sqlite)    │
│ src/tunnel.js  tunnel HTTPS Cloudflare    src/seed.js    données fictives déterministes      │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
        ▲ USSD / SMS (passerelle agrégateur)          ▲ Paiements Mobile Money (agrégateur)
```

- **Temps réel** : une seule fonction `dispatch` filtre les évènements par profil (centrale, témoin, client, agent). Transport SSE, avec repli automatique en long polling quand un proxy met le flux en tampon.
- **Persistance** : documents JSON dans SQLite (WAL), sauvegarde quotidienne automatique (7 conservées) et `npm run backup`.
- **Sécurité** : mots de passe hachés (scrypt), cookie de session `HttpOnly` + `SameSite=Lax`, actions authentifiées en JSON uniquement (anti-CSRF), limitation de débit (alertes, connexion, médias, USSD), validation des fichiers par signature binaire, médias réservés à la centrale.

## Déploiement du front sur Vercel

Vercel exécute Next.js en fonctions *serverless* : pas de processus permanent, donc ni base SQLite persistante, ni diffusion temps réel en mémoire, ni boucle d'escalade. Le déploiement se fait donc en deux parties :

1. **API** (processus Node permanent : Render, Railway, Fly.io, VPS…) : `npm run api` (ou l'image Docker avec `API_ONLY=1`), volume persistant pour `DATA_DIR`, et `PUBLIC_URL` = adresse du front Vercel (encodée dans les QR codes).
2. **Front** (Vercel) : variable `BACKEND_URL` = adresse HTTPS de l'API. `next.config.mjs` relaie alors `/api`, `/qr`, `/media`, `/demo` et `/client/demo` sur la même origine : cookies de session et temps réel fonctionnent sans CORS (le long polling prend le relais si le flux SSE est mis en tampon).

## Passage en production — feuille de route

| Sujet | Prototype | Production recommandée |
|---|---|---|
| Base de données | SQLite documentaire | **PostgreSQL + PostGIS** (requêtes géographiques, réplication) |
| Temps réel | SSE + long polling, 1 instance | Même protocole derrière un bus (Redis pub/sub) pour plusieurs instances |
| Hébergement | PC + tunnel | 2 instances minimum dans 2 zones, répartiteur de charge, domaine `.ci` en HTTPS |
| SMS / WhatsApp / appels | Pilote `simulation` | Pilote réel dans `src/notify.js` (agrégateur SMS local, WhatsApp Business API, SVI) |
| USSD | Simulateur + `POST /api/ussd` | Code court loué auprès des opérateurs (Orange, MTN, Moov) via un agrégateur |
| Mobile Money | Simulation (`startPayment`) | Agrégateur de paiement (Orange Money, MTN MoMo, Moov Money, Wave) + webhooks signés |
| Notifications client | Notifications du navigateur (page ouverte) | Web Push (service worker, clés VAPID) |
| Authentification | Comptes locaux | + double authentification pour superviseurs/admins, rotation des mots de passe |
| Supervision | `GET /api/health`, healthcheck Docker | Sonde externe, alertes d'exploitation, journaux centralisés |
| Continuité | Sauvegarde quotidienne locale | Sauvegardes chiffrées hors site, test de restauration mensuel, **mode dégradé** (ligne téléphonique de secours si Internet tombe à la centrale) |

### Ajouter un fournisseur de messagerie

Dans `src/notify.js`, ajouter un pilote :

```js
monFournisseur: {
  label: 'Mon fournisseur',
  async send(msg) {            // msg : { channel, to, toName, text, alertId }
    await fetch('https://api…', { method: 'POST', headers: { Authorization: `Bearer ${process.env.SMS_API_KEY}` }, body: … });
    return { status: 'délivré' }; // ou 'échec'
  },
},
```

puis lancer avec `NOTIFY_DRIVER=monFournisseur`.

## Intégration avec les services publics

L'envoi automatique à la police (170), aux pompiers (GSPM, 180) et au SAMU (185) suppose une **convention** avec ces services (format d'échange, numéro dédié, responsabilité). Le prototype simule la transmission ; la centrale peut aussi appeler directement depuis la fiche d'alerte.
