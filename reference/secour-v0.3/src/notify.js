// Messagerie sortante (SMS, WhatsApp, appels vocaux, radio).
// Le pilote « simulation » horodate et accuse réception sans rien envoyer.
// Pour un fournisseur réel (agrégateur SMS, WhatsApp Business, SVI), ajouter un pilote exposant
// `send(message) => Promise<{ status }>` dans DRIVERS — voir docs/ARCHITECTURE.md.

const DRIVERS = {
  simulation: {
    label: 'Simulation',
    async send(msg) {
      await new Promise((r) => setTimeout(r, 900 + Math.random() * 2600));
      return { status: msg.channel === 'Appel + SMS' ? 'transmis' : 'délivré' };
    },
  },
  instant: {
    label: 'Instantané (tests)',
    async send(msg) { return { status: msg.channel === 'Appel + SMS' ? 'transmis' : 'délivré' }; },
  },
  console: {
    label: 'Console serveur',
    async send(msg) {
      console.log(`[${msg.channel}] → ${msg.toName} <${msg.to}> : ${msg.text}`);
      return { status: 'délivré' };
    },
  },
};

export function createNotifier({ db, emit, driver = process.env.NOTIFY_DRIVER || 'simulation' }) {
  const impl = DRIVERS[driver] ?? DRIVERS.simulation;
  let outbox = db.all('outbox').sort((a, b) => a.at - b.at);
  let seq = db.meta.get('outboxSeq') ?? outbox.length;

  function send({ alertId = null, channel, to, toName, text, onStatus }) {
    seq += 1;
    db.meta.set('outboxSeq', seq);
    const msg = { id: `MSG-${String(seq).padStart(6, '0')}`, at: Date.now(), alertId, channel, to, toName, text, status: 'envoyé', driver: impl.label };
    outbox.push(msg);
    db.put('outbox', msg);
    emit('message', msg);
    impl.send(msg).then(({ status }) => {
      msg.status = status;
      msg.deliveredAt = Date.now();
      db.put('outbox', msg);
      emit('message', msg);
      onStatus?.(status);
    }).catch((err) => {
      msg.status = 'échec';
      msg.error = err.message;
      db.put('outbox', msg);
      emit('message', msg);
      onStatus?.('échec');
    });
    return msg;
  }

  return {
    send,
    driver: impl.label,
    list: ({ limit = 200, alertId } = {}) => outbox.filter((m) => !alertId || m.alertId === alertId).slice(-limit).reverse(),
    clear() { outbox = []; seq = 0; db.replaceAll('outbox', []); db.meta.set('outboxSeq', 0); },
  };
}
