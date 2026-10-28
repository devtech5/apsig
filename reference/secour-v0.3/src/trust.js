// Score de fiabilité d'une alerte (0–100). Il aide l'opérateur à prioriser, mais n'empêche
// jamais une alerte d'être traitée : une urgence n'est jamais rejetée automatiquement.

const fmtDist = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

export const CALLBACK_LABELS = {
  en_attente: 'Rappel du titulaire en cours',
  confirme: 'Titulaire joint : urgence confirmée',
  en_securite: 'Titulaire joint : déclare être en sécurité',
  injoignable: 'Titulaire injoignable',
  fausse_alerte: 'Titulaire : fausse alerte',
};

export function computeTrust(alert, ctx = {}) {
  const reasons = [];
  let score = 60;
  const add = (delta, text) => { score += delta; reasons.push({ delta, text }); };

  const loc = alert.witness?.location;
  if (loc) {
    const tolerance = Math.max(150, (loc.accuracy || 0) + 100);
    if (loc.distanceM <= tolerance) add(25, `Témoin localisé à ${fmtDist(loc.distanceM)} de la plaque`);
    else if (loc.distanceM <= 1000) add(5, `Témoin à proximité (${fmtDist(loc.distanceM)})`);
    else add(-30, `Témoin éloigné de la plaque (${fmtDist(loc.distanceM)})`);
  } else if (alert.source === 'qr') {
    reasons.push({ delta: 0, text: 'Position du témoin non partagée' });
  }

  if (alert.source === 'ussd' || alert.source === 'sms') add(10, 'Numéro de téléphone identifié par le réseau');
  if (alert.source === 'demo') reasons.push({ delta: 0, text: 'Alerte simulée depuis la console' });

  if (ctx.deviceBlocked) add(-50, 'Appareil bloqué par un superviseur');
  if (ctx.deviceOtherPlates24h >= 3) add(-25, `Appareil : ${ctx.deviceOtherPlates24h} alertes sur d'autres plaques en 24 h`);
  else if (ctx.deviceOtherPlates24h >= 1) add(-5, `Appareil : ${ctx.deviceOtherPlates24h} autre(s) alerte(s) en 24 h`);

  if (alert.retriggers > 0) add(5, 'Déclenchements répétés depuis la plaque');
  if ((alert.media?.length ?? 0) > 0) add(10, 'Photo, vocal ou message joint par le témoin');

  const cb = alert.callback?.status;
  if (cb === 'confirme') add(30, CALLBACK_LABELS.confirme);
  else if (cb === 'en_securite') add(-10, CALLBACK_LABELS.en_securite);
  else if (cb === 'injoignable') add(-5, CALLBACK_LABELS.injoignable);
  else if (cb === 'fausse_alerte') add(-60, CALLBACK_LABELS.fausse_alerte);

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, level: score >= 70 ? 'elevee' : score >= 40 ? 'moyenne' : 'faible', reasons };
}
