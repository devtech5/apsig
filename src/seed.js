// Données 100 % fictives générées de façon déterministe (mêmes plaques / QR à chaque démarrage).
// Les noms, numéros et établissements sont inventés ; seules les communes d'Abidjan sont réelles.

function mulberry32(seed) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const COMMUNES = [
  { code: 'YOP', name: 'Yopougon', weight: 22, quartiers: [
    { code: 'NIANGON', name: 'Niangon', lat: 5.3335, lng: -4.0935 },
    { code: 'SIPOREX', name: 'Siporex', lat: 5.342, lng: -4.069 },
    { code: 'TOITS-ROUGES', name: 'Toits-Rouges', lat: 5.356, lng: -4.079 },
    { code: 'SELMER', name: 'Selmer', lat: 5.35, lng: -4.062 },
    { code: 'ANDOKOI', name: 'Andokoi', lat: 5.369, lng: -4.066 },
  ] },
  { code: 'COC', name: 'Cocody', weight: 18, quartiers: [
    { code: 'RIVIERA', name: 'Riviera', lat: 5.364, lng: -3.97 },
    { code: 'ANGRE', name: 'Angré', lat: 5.396, lng: -3.988 },
    { code: 'DEUX-PLATEAUX', name: 'Deux-Plateaux', lat: 5.37, lng: -4.001 },
    { code: 'BLOCKHAUS', name: 'Blockhauss', lat: 5.333, lng: -4.001 },
  ] },
  { code: 'ABO', name: 'Abobo', weight: 16, quartiers: [
    { code: 'PK18', name: 'PK 18', lat: 5.443, lng: -4.039 },
    { code: 'AVOCATIER', name: 'Avocatier', lat: 5.428, lng: -4.029 },
    { code: 'BAOULE', name: 'Abobo-Baoulé', lat: 5.419, lng: -4.005 },
  ] },
  { code: 'ADJ', name: 'Adjamé', weight: 8, quartiers: [
    { code: 'WILLIAMSVILLE', name: 'Williamsville', lat: 5.37, lng: -4.023 },
    { code: '220-LOGTS', name: '220 Logements', lat: 5.356, lng: -4.02 },
  ] },
  { code: 'PLT', name: 'Plateau', weight: 5, quartiers: [
    { code: 'CENTRE', name: 'Plateau Centre', lat: 5.322, lng: -4.018 },
    { code: 'INDENIE', name: 'Indénié', lat: 5.333, lng: -4.019 },
  ] },
  { code: 'ATT', name: 'Attécoubé', weight: 6, quartiers: [
    { code: 'LOCODJORO', name: 'Locodjoro', lat: 5.338, lng: -4.046 },
    { code: 'ABOBODOUME', name: 'Abobo-Doumé', lat: 5.3255, lng: -4.052 },
  ] },
  { code: 'MAR', name: 'Marcory', weight: 9, quartiers: [
    { code: 'ZONE4', name: 'Zone 4', lat: 5.296, lng: -3.987 },
    { code: 'BIETRY', name: 'Biétry', lat: 5.286, lng: -3.977 },
    { code: 'REMBLAIS', name: 'Remblais', lat: 5.305, lng: -3.994 },
  ] },
  { code: 'TRE', name: 'Treichville', weight: 6, quartiers: [
    { code: 'ARRAS', name: 'Arras', lat: 5.296, lng: -4.006 },
    { code: 'BIAFRA', name: 'Biafra', lat: 5.289, lng: -4.014 },
  ] },
  { code: 'KOU', name: 'Koumassi', weight: 7, quartiers: [
    { code: 'CAMPEMENT', name: 'Campement', lat: 5.298, lng: -3.948 },
    { code: 'SOWETO', name: 'Soweto', lat: 5.29, lng: -3.96 },
  ] },
  { code: 'PBT', name: 'Port-Bouët', weight: 5, quartiers: [
    { code: 'VRIDI', name: 'Vridi', lat: 5.257, lng: -3.992 },
    { code: 'GONZAGUE', name: 'Gonzagueville', lat: 5.242, lng: -3.888 },
  ] },
];

const FIRST = ['Aya', 'Adjoua', 'Akissi', 'Amenan', 'Affoué', 'Mariam', 'Fatou', 'Awa', 'Bintou', 'Christelle',
  'Grâce', 'Estelle', 'Nadège', 'Kouadio', 'Kouamé', 'Konan', 'Yao', 'Koffi', 'Serge', 'Didier', 'Arnaud',
  'Ibrahim', 'Moussa', 'Seydou', 'Lassina', 'Jean-Marc', 'Hervé', 'Franck', 'Wilfried', 'Ange'];
const LAST = ['Kouassi', 'Konan', 'Koffi', 'Yao', 'Kouamé', "N'Guessan", 'Kouadio', 'Traoré', 'Coulibaly',
  'Ouattara', 'Bamba', 'Koné', 'Touré', 'Diabaté', 'Cissé', 'Aka', 'Brou', 'Gnagne', 'Assi', 'Tano', 'Ehui',
  'Dosso', 'Sangaré', 'Yéo', 'Soro', 'Kacou', 'Amani', 'Ahoua', 'Zadi', 'Gbané'];
const RELATIONS = ['Conjoint(e)', 'Fils', 'Fille', 'Frère', 'Sœur', 'Voisin(e)'];
const KINDS = ['Domicile', 'Domicile', 'Domicile', 'Commerce', 'Bureau', 'Résidence'];

// Plaques mises en avant pendant la démo (codes lisibles, contenus réalistes mais fictifs).
const SHOWCASE = [
  { code: 'ABJ-YOP-NIANGON-453', commune: 'YOP', quartier: 'NIANGON', pass: 'bleu', kind: 'Domicile', label: 'Villa 453, Niangon Sud', owner: 'Aya Kouassi', community: true },
  { code: 'ABJ-COC-RIVIERA-118', commune: 'COC', quartier: 'RIVIERA', pass: 'rouge', kind: 'Résidence', label: 'Résidence Les Palmiers (fictive)', owner: 'Serge Konan', community: true },
  { code: 'ABJ-PLT-CENTRE-027', commune: 'PLT', quartier: 'CENTRE', pass: 'rouge', kind: 'Commerce', label: 'Pharmacie de la Cité (fictive)', owner: 'Mariam Ouattara', community: false },
  { code: 'ABJ-MAR-ZONE4-212', commune: 'MAR', quartier: 'ZONE4', pass: 'rouge', kind: 'Commerce', label: 'Restaurant Le Baobab (fictif)', owner: 'Hervé Aka', community: false },
  { code: 'ABJ-ABO-PK18-076', commune: 'ABO', quartier: 'PK18', pass: 'bleu', kind: 'Commerce', label: 'Boutique Mama Bintou (fictive)', owner: 'Bintou Traoré', community: true },
  { code: 'ABJ-ADJ-WILLIAMSVILLE-341', commune: 'ADJ', quartier: 'WILLIAMSVILLE', pass: 'bleu', kind: 'École', label: 'École primaire Les Étoiles (fictive)', owner: 'Didier Yao', community: true },
  { code: 'ABJ-KOU-CAMPEMENT-190', commune: 'KOU', quartier: 'CAMPEMENT', pass: 'bleu', kind: 'Domicile', label: 'Cour commune 190', owner: 'Akissi Brou', community: true },
  { code: 'ABJ-TRE-ARRAS-064', commune: 'TRE', quartier: 'ARRAS', pass: 'bleu', kind: 'Commerce', label: 'Maquis Chez Tantie (fictif)', owner: 'Amenan Kacou', community: false },
  { code: 'ABJ-PBT-VRIDI-505', commune: 'PBT', quartier: 'VRIDI', pass: 'rouge', kind: 'Bureau', label: 'Entrepôt Logistique Vridi (fictif)', owner: 'Ibrahim Koné', community: false },
  { code: 'ABJ-COC-ANGRE-287', commune: 'COC', quartier: 'ANGRE', pass: 'bleu', kind: 'Domicile', label: 'Villa 287, Angré 8e tranche', owner: 'Estelle Gnagne', community: true },
  { code: 'ABJ-YOP-SIPOREX-158', commune: 'YOP', quartier: 'SIPOREX', pass: 'bleu', kind: 'Domicile', label: 'Immeuble Siporex, porte 158', owner: 'Moussa Diabaté', community: true },
  { code: 'ABJ-ATT-LOCODJORO-033', commune: 'ATT', quartier: 'LOCODJORO', pass: 'bleu', kind: 'Domicile', label: 'Concession 33, Locodjoro', owner: 'Koffi Assi', community: true },
];

export const UNITS = [
  { id: 'APS-ALPHA', name: 'Alpha', kind: 'patrouille', leader: 'Sgt. K. Bamba', commune: 'YOP', lat: 5.347, lng: -4.081 },
  { id: 'APS-BRAVO', name: 'Bravo', kind: 'patrouille', leader: 'Sgt. A. Tano', commune: 'COC', lat: 5.362, lng: -3.985 },
  { id: 'APS-CHARLIE', name: 'Charlie', kind: 'patrouille', leader: 'Sgt. M. Cissé', commune: 'ADJ', lat: 5.343, lng: -4.022 },
  { id: 'APS-DELTA', name: 'Delta', kind: 'patrouille', leader: 'Sgt. F. Ehui', commune: 'MAR', lat: 5.298, lng: -3.99 },
  { id: 'APS-ECHO', name: 'Echo', kind: 'patrouille', leader: 'Sgt. L. Soro', commune: 'ABO', lat: 5.428, lng: -4.022 },
  { id: 'APS-FOXTROT', name: 'Foxtrot', kind: 'patrouille', leader: 'Sgt. H. Dosso', commune: 'KOU', lat: 5.28, lng: -3.955 },
  { id: 'APS-ROUGE1', name: 'Rouge 1', kind: 'intervention', leader: 'Adj. S. Yéo', commune: 'COC', lat: 5.355, lng: -3.998 },
  { id: 'APS-ROUGE2', name: 'Rouge 2', kind: 'intervention', leader: 'Adj. W. Zadi', commune: 'YOP', lat: 5.338, lng: -4.064 },
];


export const TOTAL_PLATES = 184;
export const HISTORY_DAYS = 30;

// Code USSD fictif imprimé sur les plaques (accès sans Internet).
export const USSD_CODE = '*789#';
// Tarifs indicatifs fictifs, en FCFA par mois.
export const TARIFFS = { bleu: 2500, rouge: 10000 };
export const MOBILE_MONEY = ['Orange Money', 'MTN MoMo', 'Moov Money', 'Wave'];

// Comptes de démonstration (mots de passe de test, stockés hachés en base).
export const DEMO_PASSWORD = { admin: 'Admin#2026', superviseur: 'Superviseur#2026', operateur: 'Operateur#2026', agent: 'Terrain#2026' };
export const DEMO_USERS = [
  { id: 'U-ADMIN', username: 'admin', name: 'Admin APSIG', role: 'admin', phone: '+225 07 00 90 00 01' },
  { id: 'U-SUP', username: 'superviseur', name: 'M. Coulibaly (superviseur)', role: 'superviseur', phone: '+225 07 00 90 00 02' },
  { id: 'U-OP1', username: 'operateur', name: 'Opérateur 01 — A. Koné', role: 'operateur', phone: '+225 07 00 90 00 03' },
  { id: 'U-OP2', username: 'operateur2', name: 'Opérateur 02 — F. Yao', role: 'operateur', phone: '+225 07 00 90 00 04' },
  ...UNITS.map((u) => ({
    id: `U-${u.id}`,
    username: `agent.${u.name.toLowerCase().replace(/\s+/g, '')}`,
    name: `${u.leader} (Unité ${u.name})`,
    role: 'agent',
    unitId: u.id,
    phone: null,
  })),
];

export function buildSeed(now = Date.now()) {
  const rnd = mulberry32(20261013);
  // Second générateur pour les champs ajoutés : les jetons QR restent identiques d'une version à l'autre.
  const rnd2 = mulberry32(777);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + rnd() * (b - a);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const token = (r = rnd, len = 10) => {
    let s = '';
    for (let i = 0; i < len; i++) s += alphabet[Math.floor(r() * alphabet.length)];
    return s;
  };
  const phone = () => `+225 07 00 ${String(Math.floor(rnd() * 100)).padStart(2, '0')} ${String(Math.floor(rnd() * 100)).padStart(2, '0')} ${String(Math.floor(rnd() * 100)).padStart(2, '0')}`;
  const person = () => `${pick(FIRST)} ${pick(LAST)}`;
  const communeByCode = Object.fromEntries(COMMUNES.map((c) => [c.code, c]));
  const weighted = COMMUNES.flatMap((c) => Array(c.weight).fill(c));

  const chiefs = {};
  for (const c of COMMUNES) {
    for (const q of c.quartiers) chiefs[`${c.code}-${q.code}`] = { name: `${person()} (chef de quartier)`, phone: phone() };
  }

  const usedCodes = new Set();
  const usedShort = new Set();
  const shortCode = (i, showcase) => {
    if (showcase) return String(10001 + i);
    let c;
    do { c = String(20000 + Math.floor(rnd2() * 79999)); } while (usedShort.has(c));
    usedShort.add(c);
    return c;
  };
  const makePlate = (spec, index) => {
    const commune = communeByCode[spec.commune];
    const quartier = commune.quartiers.find((q) => q.code === spec.quartier);
    const jitter = 0.0035;
    const contacts = [];
    const n = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < n; i++) contacts.push({ name: person(), relation: pick(RELATIONS), phone: phone() });
    usedCodes.add(spec.code);
    const showcase = spec.showcaseIndex !== undefined;
    const plate = {
      id: `PL-${String(index + 1).padStart(4, '0')}`,
      token: token(),
      tokenHistory: [],
      code: spec.code,
      pass: spec.pass,
      kind: spec.kind,
      label: spec.label,
      commune: commune.name,
      communeCode: commune.code,
      quartier: quartier.name,
      quartierCode: quartier.code,
      lat: +(quartier.lat + between(-jitter, jitter)).toFixed(5),
      lng: +(quartier.lng + between(-jitter, jitter)).toFixed(5),
      owner: { name: spec.owner, phone: phone() },
      contacts,
      community: spec.community ? chiefs[`${commune.code}-${quartier.code}`] : null,
      status: 'active',
      installedAt: now - Math.floor(between(15, 420)) * 86400000,
      showcase,
    };
    plate.shortCode = shortCode(spec.showcaseIndex ?? 0, showcase);
    plate.clientKey = token(rnd2, 16);
    // Abonnement : la plupart à jour, quelques-uns expirés (dont une vitrine pour la démo).
    const expired = spec.code === 'ABJ-ATT-LOCODJORO-033' || (!showcase && rnd2() < 0.06);
    plate.subscription = {
      plan: plate.pass,
      since: plate.installedAt,
      expiresAt: expired ? now - Math.floor(3 + rnd2() * 40) * 86400000 : now + Math.floor(12 + rnd2() * 300) * 86400000,
    };
    return plate;
  };

  const plates = SHOWCASE.map((s, i) => makePlate({ ...s, showcaseIndex: i }, i));
  while (plates.length < TOTAL_PLATES) {
    const commune = pick(weighted);
    const quartier = pick(commune.quartiers);
    const num = String(1 + Math.floor(rnd() * 998)).padStart(3, '0');
    const code = `ABJ-${commune.code}-${quartier.code}-${num}`;
    if (usedCodes.has(code)) continue;
    const kind = pick(KINDS);
    const owner = person();
    const label = kind === 'Domicile' ? `${kind} famille ${owner.split(' ').slice(1).join(' ')}` : `${kind} n° ${num}, ${quartier.name}`;
    plates.push(makePlate({ code, commune: commune.code, quartier: quartier.code, pass: rnd() < 0.3 ? 'rouge' : 'bleu', kind, label, owner, community: rnd() < 0.45 }, plates.length));
  }

  const units = UNITS.map((u) => ({ ...u, phone: phone(), base: { lat: u.lat, lng: u.lng }, status: 'disponible', alertId: null, mission: null, gpsAt: null }));

  // Appareils de témoins : un parc courant + un appareil suspect (déclenchements sur plusieurs plaques).
  const devices = Array.from({ length: 160 }, () => `d-${token(rnd2, 8).toLowerCase()}`);
  const SUSPECT = 'd-7f3az9qk';

  const alerts = [];
  let seq = 0;
  const typeOf = () => { const r = rnd(); return r < 0.42 ? 'agression' : r < 0.82 ? 'medical' : 'incendie'; };
  const OUTCOMES = {
    agression: ['Intrusion repoussée, auteurs en fuite', 'Individu interpellé et remis à la police', 'Agression évitée, victime rassurée'],
    medical: ['Victime évacuée par le SAMU', 'Premiers secours prodigués, état stable', 'Transport vers clinique par la famille'],
    incendie: ['Départ de feu maîtrisé avant arrivée GSPM', 'Incendie éteint par le GSPM', 'Fumée sans feu, installation sécurisée'],
  };
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);
  const pushAlert = (createdAt, status, forced = {}) => {
    const plate = forced.plate ?? plates[Math.floor(rnd() * plates.length)];
    const type = forced.type ?? typeOf();
    seq += 1;
    const ack = createdAt + Math.floor(between(15, 95)) * 1000;
    const nearest = [...units].sort((a, b) => Math.hypot(a.base.lat - plate.lat, a.base.lng - plate.lng) - Math.hypot(b.base.lat - plate.lat, b.base.lng - plate.lng));
    const unit = plate.pass === 'rouge' && type === 'agression' ? nearest.find((u) => u.kind === 'intervention') : nearest.find((u) => u.kind === 'patrouille');
    const onSite = ack + Math.floor(between(6, 19)) * 60000;
    const closed = onSite + Math.floor(between(12, 55)) * 60000;
    const roll = rnd();
    const near = rnd2() < 0.62;
    const a = {
      id: `ALR-${String(seq).padStart(5, '0')}`,
      plateId: plate.id,
      code: plate.code,
      pass: plate.pass,
      type,
      priority: type === 'medical' ? 'haute' : 'critique',
      commune: plate.commune,
      quartier: plate.quartier,
      lat: plate.lat,
      lng: plate.lng,
      source: rnd2() < 0.07 ? 'ussd' : 'qr',
      lang: rnd2() < 0.08 ? 'en' : 'fr',
      status,
      createdAt,
      ackAt: ack,
      onSiteAt: null,
      closedAt: null,
      unitId: unit.id,
      outcome: null,
      deviceId: forced.deviceId ?? devices[Math.floor(rnd2() * devices.length)],
      msisdn: null,
      witness: near ? { location: { lat: plate.lat + 0.0003, lng: plate.lng - 0.0002, accuracy: 20 + Math.floor(rnd2() * 40), distanceM: 15 + Math.floor(rnd2() * 90), at: createdAt + 8000 } } : {},
      media: [],
      retriggers: 0,
      callback: { status: rnd2() < 0.7 ? 'confirme' : 'injoignable', at: ack + 30000 },
      escalation: { level: 0, at: null },
      notified: [],
      timeline: [],
      reporterKey: null,
    };
    if (a.source === 'ussd') { a.deviceId = null; a.witness = {}; a.msisdn = phone(); }
    if (status === 'cloturee') {
      if (forced.outcome) {
        a.outcome = forced.outcome; a.closedAt = ack + 9 * 60000; a.unitId = forced.outcome.startsWith('Fausse') ? unit.id : a.unitId;
        a.onSiteAt = ack + 7 * 60000; a.callback = { status: 'fausse_alerte', at: ack + 30000 }; a.witness = {};
      } else if (roll < 0.07) {
        a.status = 'annulee'; a.unitId = null; a.closedAt = ack + 60000; a.outcome = 'Annulée par le témoin (erreur de manipulation)';
      } else if (roll < 0.11) {
        a.onSiteAt = onSite; a.closedAt = onSite + 8 * 60000; a.outcome = 'Fausse alerte / malveillance'; a.callback = { status: 'fausse_alerte', at: ack + 30000 };
      } else {
        a.onSiteAt = onSite; a.closedAt = closed; a.outcome = pick(OUTCOMES[type]);
      }
    }
    alerts.push(a);
    return a;
  };

  for (let d = HISTORY_DAYS; d >= 1; d--) {
    const dayStart = startOfToday.getTime() - d * 86400000;
    const count = 18 + Math.floor(rnd() * 14);
    const times = Array.from({ length: count }, () => dayStart + Math.floor(between(0, 86400000))).sort((a, b) => a - b);
    for (const t of times) pushAlert(t, 'cloturee');
  }

  const elapsedToday = now - startOfToday.getTime();
  const todayCount = Math.max(12, Math.round((elapsedToday / 3600000) * 2.2));
  const latestClosed = now - 45 * 60000;
  const todayTimes = Array.from({ length: todayCount }, () => startOfToday.getTime() + Math.floor(between(0, Math.max(latestClosed - startOfToday.getTime(), 3600000))))
    .map((t) => Math.min(t, latestClosed)).sort((a, b) => a - b);
  for (const t of todayTimes) {
    const a = pushAlert(t, 'cloturee');
    // Une alerte clôturée ne peut pas se terminer dans le futur.
    if (a.closedAt && a.closedAt > now - 5 * 60000) a.closedAt = now - 5 * 60000;
    if (a.onSiteAt && a.onSiteAt > a.closedAt) a.onSiteAt = a.closedAt - 10 * 60000;
  }

  // Appareil suspect : 4 fausses alertes sur des plaques différentes ces dernières 20 heures.
  for (let i = 0; i < 4; i++) {
    const plate = plates[40 + i * 17];
    pushAlert(now - (20 - i * 4) * 3600000, 'cloturee', { plate, type: 'agression', deviceId: SUSPECT, outcome: 'Fausse alerte / malveillance' });
  }

  // Interventions en cours au démarrage (pour un tableau de bord vivant).
  const live = [
    { type: 'medical', code: 'ABJ-ABO-PK18-076', minutesAgo: 22, status: 'sur_place' },
    { type: 'agression', code: 'ABJ-MAR-ZONE4-212', minutesAgo: 6, status: 'en_route' },
  ];
  for (const l of live) {
    const plate = plates.find((p) => p.code === l.code);
    const a = pushAlert(now - l.minutesAgo * 60000, l.status, { plate, type: l.type });
    const unit = l.type === 'agression' && plate.pass === 'rouge' ? units.find((u) => u.id === 'APS-ROUGE1') : units.find((u) => u.id === 'APS-ECHO');
    Object.assign(a, { source: 'qr', unitId: unit.id, witness: { location: { lat: plate.lat + 0.0002, lng: plate.lng + 0.0001, accuracy: 18, distanceM: 24, at: a.createdAt + 7000 } }, callback: { status: 'confirme', at: a.ackAt + 20000 } });
    unit.status = 'en_mission';
    unit.alertId = a.id;
    if (l.status === 'sur_place') {
      a.onSiteAt = now - 9 * 60000;
      unit.lat = plate.lat + 0.0006; unit.lng = plate.lng + 0.0006;
    } else {
      unit.mission = { alertId: a.id, from: { lat: unit.lat, lng: unit.lng }, to: { lat: plate.lat, lng: plate.lng }, startedAt: now, duration: 150000 };
    }
  }

  // Numérotation chronologique (les alertes forcées sont créées hors ordre).
  alerts.sort((a, b) => a.createdAt - b.createdAt);
  const renamed = new Map();
  alerts.forEach((a, i) => {
    const id = `ALR-${String(i + 1).padStart(5, '0')}`;
    renamed.set(a.id, id);
    a.id = id;
  });
  for (const u of units) {
    if (u.alertId) u.alertId = renamed.get(u.alertId);
    if (u.mission) u.mission.alertId = renamed.get(u.mission.alertId);
  }
  return { plates, units, alerts, seq, suspectDevice: SUSPECT };
}
