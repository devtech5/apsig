'use client';

import { useState } from 'react';
import { Badge, Button, EmptyState, Field, Icon, Modal, StatusPill, cx, inputCls, textareaCls } from '../../ui';
import {
  api, chrono, distanceKm, etaMinutes, fmtDate, fmtDist, fmtTime, fmtTimeSec, isOpen, toast,
  CALLBACK_META, SOURCE_LABEL, STATUS_META, TRUST_META, TYPE_META,
} from '@/lib/common';

export const CHANNEL_ICON = { Console: 'monitor', Radio: 'radio', 'Appel + SMS': 'phone', SMS: 'message', WhatsApp: 'message', 'Appel vocal': 'phone' };
const TYPE_BG = { agression: 'from-agression/30', medical: 'from-medical/30', incendie: 'from-incendie/30' };
const TYPE_ICON_BG = { agression: 'bg-agression', medical: 'bg-medical', incendie: 'bg-incendie' };
const OUTCOMES = {
  agression: ['Intrusion repoussée, auteurs en fuite', 'Individu interpellé et remis à la police', 'Agression évitée, victime rassurée'],
  medical: ['Victime évacuée par le SAMU', 'Premiers secours prodigués, état stable', 'Transport vers clinique par la famille'],
  incendie: ['Départ de feu maîtrisé', 'Incendie éteint par le GSPM', 'Fumée sans feu, installation sécurisée'],
};

export function TrustBadge({ trust, withScore = true }) {
  if (!trust) return null;
  const meta = TRUST_META[trust.level];
  return <Badge tone={meta.tone} title={meta.label}><Icon name="shieldCheck" className="size-3" />{withScore ? trust.score : meta.label}</Badge>;
}

function Section({ icon, title, children }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold tracking-wider text-muted uppercase"><Icon name={icon} className="size-3.5" />{title}</h3>
      {children}
    </section>
  );
}

function Pick({ items }) {
  return (
    <ul className="grid gap-2">
      {items.map((it) => (
        <li key={it.key}>
          <button
            type="button"
            disabled={it.disabled}
            onClick={it.onClick}
            className={cx('flex w-full cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-45', it.highlight ? 'border-success bg-success-bg' : 'border-line')}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-ink"><Icon name={it.icon} /></span>
            <span className="min-w-0 flex-1 text-sm text-ink">{it.main}<small className="block text-muted">{it.sub}</small></span>
            {it.side && <span className="text-right text-sm font-bold text-ink">{it.side}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

export function BlockDeviceModal({ device, onClose, onDone }) {
  const [note, setNote] = useState('');
  if (!device) return <Modal open={false} onClose={onClose} />;
  const { id, block } = device;
  async function save() {
    try {
      await api(`/api/ops/devices/${encodeURIComponent(id)}/block`, { method: 'POST', body: { blocked: block, note } });
      toast(block ? 'Appareil bloqué' : 'Appareil débloqué', 'success');
      onDone?.();
      onClose();
    } catch (err) { toast(err.message, 'error'); }
  }
  return (
    <Modal open onClose={onClose} title={`${block ? 'Bloquer' : 'Débloquer'} l'appareil ${id}`}
      footer={<><Button onClick={onClose}>Annuler</Button><Button variant={block ? 'danger' : 'primary'} onClick={save}><Icon name="ban" />{block ? 'Bloquer' : 'Débloquer'}</Button></>}>
      <p className="mb-4 text-sm text-muted">{block ? 'Les alertes de cet appareil resteront reçues (une urgence n\'est jamais rejetée) mais leur fiabilité sera abaissée et les déclenchements limités à un toutes les 10 minutes.' : 'L\'appareil retrouvera un fonctionnement normal.'}</p>
      <Field label="Motif"><textarea className={textareaCls} rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : fausses alertes répétées sur plusieurs plaques" /></Field>
    </Modal>
  );
}

export default function Detail({ alert: a, units, rank, now, run, onBlock }) {
  const [modal, setModal] = useState(null); // 'assign' | 'call' | 'calling' | 'note' | 'close'
  const [calling, setCalling] = useState(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState('');
  const [closeNote, setCloseNote] = useState('');
  const [busy, setBusy] = useState(false);

  if (!a) {
    return (
      <div className="grid h-full place-items-center">
        <EmptyState icon="bell" title="Aucune alerte sélectionnée">Choisissez une alerte dans la file ou sur la carte.</EmptyState>
      </div>
    );
  }

  const meta = TYPE_META[a.type];
  const open = isOpen(a);
  const plate = a.plate ?? {};
  const unit = a.unit;
  const unitLive = unit && units.find((u) => u.id === unit.id);
  const km = unitLive ? distanceKm(unitLive, a) : 0;
  const closeModal = () => setModal(null);

  async function act(action, body) {
    setBusy(true);
    const res = await run(a.id, action, body);
    setBusy(false);
    return res;
  }

  // --- Progression ---
  const assignedAt = a.timeline.find((e) => /affectée/.test(e.text))?.at;
  const steps = [
    { label: 'Reçue', at: a.createdAt },
    { label: 'Prise en charge', at: a.ackAt },
    { label: 'En route', at: assignedAt },
    { label: 'Sur place', at: a.onSiteAt },
    { label: a.status === 'annulee' ? 'Annulée' : 'Clôturée', at: a.closedAt },
  ];
  const done = { nouvelle: 1, prise_en_charge: 2, en_route: 3, sur_place: 4, cloturee: 5, annulee: 5 }[a.status];

  const primary = {
    nouvelle: <Button variant="danger" className="col-span-2" disabled={busy} onClick={() => act('ack')}><Icon name="check" />Prendre en charge</Button>,
    prise_en_charge: <Button variant="primary" className="col-span-2" onClick={() => setModal('assign')}><Icon name="car" />Affecter une unité</Button>,
    en_route: <Button variant="primary" className="col-span-2" disabled={busy} onClick={() => act('onsite')}><Icon name="pin" />Confirmer l'arrivée sur place</Button>,
    sur_place: <Button variant="success" className="col-span-2" onClick={() => { setOutcome(OUTCOMES[a.type][0]); setModal('close'); }}><Icon name="flag" />Clôturer l'intervention</Button>,
  }[a.status];

  // --- Affectation ---
  const needArmed = a.pass === 'rouge' && a.type === 'agression';
  const sorted = units.map((u) => ({ ...u, km: distanceKm(u, a) })).sort((x, y) => x.km - y.km);
  const rec = sorted.find((u) => u.status === 'disponible' && (needArmed ? u.kind === 'intervention' : u.kind === 'patrouille')) ?? sorted.find((u) => u.status === 'disponible');

  // --- Appels ---
  const targets = [];
  if (plate.owner) targets.push({ icon: 'user', name: plate.owner.name, sub: 'Titulaire de la plaque', phone: plate.owner.phone });
  for (const c of plate.contacts ?? []) targets.push({ icon: 'users', name: c.name, sub: c.relation, phone: c.phone });
  if (a.msisdn) targets.push({ icon: 'smartphone', name: 'Témoin (USSD/SMS)', sub: 'Numéro identifié', phone: a.msisdn });
  if (plate.community) targets.push({ icon: 'home', name: plate.community.name, sub: 'Responsable communautaire', phone: plate.community.phone });
  if (a.unit) targets.push({ icon: 'radio', name: `Unité ${a.unit.name}`, sub: a.unit.leader, phone: a.unit.phone });
  const svc = a.notified.find((n) => n.role === 'service');
  if (svc) targets.push({ icon: 'shield', name: svc.actor, sub: 'Service public compétent', phone: svc.target });

  const cb = a.callback ?? { status: 'en_attente' };
  const cbMeta = CALLBACK_META[cb.status];
  const loc = a.witness?.location;
  const dev = a.device;
  const media = a.media ?? [];
  const hasWitness = loc || dev || media.length || a.msisdn;

  return (
    <div className="flex h-full flex-col">
      <div className={cx('flex items-start gap-3 bg-gradient-to-b to-transparent px-5 pt-5 pb-4', TYPE_BG[a.type])}>
        <span className={cx('grid size-12 shrink-0 place-items-center rounded-xl text-white shadow-lg', TYPE_ICON_BG[a.type])}><Icon name={meta.icon} className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold tracking-wide text-muted uppercase">{a.priority === 'critique' ? 'Alerte critique' : 'Alerte prioritaire'} · {a.id} · {SOURCE_LABEL[a.source] ?? ''}</p>
          <h2 className="text-lg leading-tight font-extrabold text-ink">{meta.label}</h2>
        </div>
        <div className="mono text-right text-xl font-bold text-ink tabular-nums">
          {open ? chrono(now - a.createdAt) : chrono((a.closedAt ?? a.createdAt) - a.createdAt)}
          <small className="block font-sans text-[10px] font-semibold text-muted uppercase">{open ? 'écoulé' : 'durée totale'}</small>
        </div>
      </div>

      {a.escalation?.level > 0 && a.status === 'nouvelle' && (
        <div className="animate-flash mx-5 mb-3 flex items-center gap-2 rounded-xl bg-agression px-3 py-2 text-sm font-bold text-white"><Icon name="alert" />Escalade niveau {a.escalation.level} — {a.escalation.level === 1 ? 'superviseur alerté' : 'responsable de la centrale appelé'}</div>
      )}
      {a.subscriptionExpired && (
        <div className="mx-5 mb-3 flex items-center gap-2 rounded-xl bg-warning-bg px-3 py-2 text-sm text-warning-ink"><Icon name="wallet" />Abonnement expiré — alerte traitée quand même (l'urgence prime).</div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 pb-4 text-sm">
          {[
            ['Code', <><span className="mono font-bold">{a.code}</span>{plate.shortCode && <small className="mono block text-muted">USSD *789*{plate.shortCode}#</small>}</>],
            ['Déclenchée', <>{fmtTimeSec(a.createdAt)}<small className="block text-muted">{fmtDate(a.createdAt)}</small></>],
            ['Adresse', <>{plate.label}<small className="block text-muted">{a.quartier}, {a.commune}</small></>],
            ['Pass', <><Badge tone={a.pass}>{a.pass === 'rouge' ? 'Rouge Premium' : 'Bleu'}</Badge><small className="block text-muted">{a.pass === 'rouge' ? 'Intervention armée incluse' : 'SOS Secours'}</small></>],
            ['Titulaire', <>{plate.owner?.name}<small className="mono block text-muted">{plate.owner?.phone}</small></>],
            ['Statut', <><StatusPill meta={STATUS_META[a.status]} />{a.trust && <div className="mt-1"><TrustBadge trust={a.trust} withScore={false} /></div>}</>],
          ].map(([k, v]) => (
            <div key={k}><dt className="text-[11px] font-semibold tracking-wide text-muted uppercase">{k}</dt><dd className="mt-0.5 text-ink">{v}</dd></div>
          ))}
        </dl>

        {open ? (
          <div className="grid grid-cols-2 gap-2 px-5 pb-4">
            {primary}
            <Button size="sm" onClick={() => setModal('call')}><Icon name="phone" />Appeler</Button>
            <Button size="sm" onClick={() => setModal('assign')}><Icon name="car" />{a.unitId ? 'Réaffecter' : 'Affecter'}</Button>
            <Button size="sm" onClick={() => { setNote(''); setModal('note'); }}><Icon name="edit" />Note</Button>
            <Button size="sm" onClick={() => { setOutcome(OUTCOMES[a.type][0]); setCloseNote(''); setModal('close'); }}><Icon name="flag" />Clôturer</Button>
          </div>
        ) : (
          <div className="mx-5 mb-4 rounded-xl bg-surface-2 px-4 py-3">
            <small className="text-muted">{a.status === 'annulee' ? 'Annulation' : 'Issue de l\'intervention'}</small>
            <strong className="block text-ink">{a.outcome}</strong>
          </div>
        )}

        <ol aria-label="Progression" className="grid grid-cols-5 gap-1 px-5 pb-5">
          {steps.map((s, i) => {
            const isDone = i < done;
            const isCur = i === done;
            return (
              <li key={s.label} className="text-center">
                <span className={cx('mx-auto mb-1.5 block h-1.5 rounded-full', isDone ? 'bg-success' : isCur ? 'animate-pulse bg-warning' : 'bg-surface-3')} />
                <span className={cx('block text-[11px] leading-tight font-semibold', isDone ? 'text-ink' : 'text-muted')}>{s.label}</span>
                <time className="mono block text-[10px] text-muted">{s.at && isDone ? fmtTime(s.at) : ' '}</time>
              </li>
            );
          })}
        </ol>

        {unit && (
          <Section icon="car" title="Unité affectée">
            <div className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
              <Icon name={unitLive?.gps ? 'locate' : 'car'} className="mt-0.5 size-5 text-info" />
              <div className="text-sm text-ink">
                <strong>Unité {unit.name}</strong> · {unit.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'} {unitLive?.gps && <Badge tone="success">GPS réel</Badge>}
                <small className="block text-muted">{unit.leader} · <span className="mono">{unit.phone}</span></small>
                {a.status === 'en_route' && <small className="block font-semibold text-info">À {km.toFixed(1)} km · arrivée estimée ~{etaMinutes(km)} min{a.unitAckAt ? ' · mission acceptée sur le terrain' : ''}</small>}
              </div>
            </div>
          </Section>
        )}

        <Section icon="phone" title="Rappel automatique du titulaire">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={cbMeta.tone}>{cbMeta.short}</Badge>
            <small className="text-muted">{cb.status !== 'en_attente' && cb.at ? `${fmtTime(cb.at)}${cb.by ? ` · ${cb.by}` : ''}` : 'Appel vocal automatique envoyé'}</small>
          </div>
          {open && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[['confirme', 'Urgence confirmée'], ['en_securite', 'En sécurité'], ['injoignable', 'Injoignable'], ['fausse_alerte', 'Fausse alerte']].map(([s, l]) => (
                <Button key={s} size="sm" className={cx(cb.status === s && '!ring-2 !ring-focus')} onClick={() => act('callback', { status: s })}>{l}</Button>
              ))}
            </div>
          )}
        </Section>

        {a.trust && (
          <Section icon="shieldCheck" title="Fiabilité de l'alerte">
            <div className="flex items-center gap-3">
              <strong className="text-3xl font-extrabold text-ink tabular-nums">{a.trust.score}<small className="text-sm font-semibold text-muted">/100</small></strong>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-3">
                <span className={cx('block h-full rounded-full', a.trust.level === 'elevee' ? 'bg-success' : a.trust.level === 'moyenne' ? 'bg-warning' : 'bg-agression')} style={{ width: `${a.trust.score}%` }} />
              </div>
              <TrustBadge trust={a.trust} withScore={false} />
            </div>
            <ul className="mt-3 grid gap-1 text-[13px]">
              {a.trust.reasons.map((r, i) => (
                <li key={i} className="flex gap-2 text-ink">
                  <span className={cx('mono w-8 shrink-0 text-right font-bold', r.delta > 0 ? 'text-success' : r.delta < 0 ? 'text-agression' : 'text-muted')}>{r.delta > 0 ? '+' : ''}{r.delta || '·'}</span>{r.text}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {hasWitness && (
          <Section icon="user" title="Témoin">
            <div className="grid gap-2 text-sm text-ink">
              {loc ? <p className="flex items-center gap-2"><Icon name="locate" className="text-violet-400" />Position partagée : <strong>{fmtDist(loc.distanceM)}</strong> de la plaque <small className="text-muted">(±{loc.accuracy} m)</small></p>
                : a.source === 'qr' && <p className="flex items-center gap-2 text-muted"><Icon name="locate" />Position non partagée</p>}
              {a.msisdn && <p className="flex items-center gap-2"><Icon name="phone" />Numéro identifié : <span className="mono">{a.msisdn}</span></p>}
              {dev && (
                <div className="flex flex-wrap items-center gap-2">
                  <Icon name="smartphone" />Appareil <span className="mono">{dev.id}</span> · {dev.last24h} alerte(s) / 24 h sur {dev.plates24h} plaque(s)
                  {dev.blocked && <Badge tone="danger">Bloqué</Badge>}
                  {rank >= 2 && <Button size="sm" onClick={() => onBlock(dev.id, !dev.blocked)}><Icon name="ban" />{dev.blocked ? 'Débloquer' : 'Bloquer'}</Button>}
                </div>
              )}
            </div>
            {media.length > 0 && (
              <div className="mt-3 grid gap-2">
                {media.map((m, i) => {
                  if (m.kind === 'photo') return <a key={i} href={m.url} target="_blank" rel="noopener" className="block overflow-hidden rounded-xl ring-1 ring-line"><img src={m.url} alt="Photo du témoin" className="max-h-56 w-full object-cover" /></a>;
                  if (m.kind === 'audio') return <audio key={i} controls preload="none" src={m.url} className="w-full" />;
                  return <blockquote key={i} className="rounded-xl border-l-4 border-info bg-surface-2 px-3 py-2 text-sm text-ink">« {m.text} »<small className="block text-muted">{fmtTime(m.at)}</small></blockquote>;
                })}
              </div>
            )}
          </Section>
        )}

        <Section icon="users" title={`Acteurs notifiés (${a.notified.length})`}>
          <ul className="grid gap-2">
            {a.notified.map((n, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-muted"><Icon name={CHANNEL_ICON[n.channel] ?? 'message'} /></span>
                <span className="min-w-0 flex-1 text-ink">{n.actor}<small className="block truncate text-muted">{n.channel} · <span className="mono">{n.target}</span></small></span>
                <Badge tone={n.status === 'envoyé' ? 'neutral' : 'success'}>{n.status}</Badge>
              </li>
            ))}
          </ul>
        </Section>

        <Section icon="history" title="Journal horodaté">
          <ol className="relative grid gap-3 border-l border-line pl-4">
            {[...a.timeline].reverse().map((t, i) => (
              <li key={i} className="relative text-sm">
                <span className={cx('absolute top-1.5 -left-[21px] size-2.5 rounded-full ring-4 ring-surface', t.kind === 'system' ? 'bg-muted' : t.kind === 'operator' ? 'bg-info' : t.kind === 'unit' ? 'bg-success' : t.kind === 'escalation' ? 'bg-agression' : 'bg-warning')} />
                <time className="mono block text-[11px] text-muted">{fmtTimeSec(t.at)}</time>
                <span className="text-ink">{t.text}</span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* --- Fenêtres d'action --- */}
      <Modal open={modal === 'assign'} onClose={closeModal} title={`Affecter une unité · ${a.code}`}>
        <p className="mb-4 text-sm text-muted">{needArmed ? 'Pass Rouge + agression : une équipe d\'intervention armée est recommandée.' : 'Unités triées par distance. La plus proche disponible est recommandée.'} La mission s'affiche aussitôt sur l'application terrain de l'unité.</p>
        <Pick items={sorted.map((u) => {
          const unitBusy = u.status !== 'disponible' && u.alertId !== a.id;
          const isRec = rec && u.id === rec.id;
          return {
            key: u.id,
            icon: u.gps ? 'locate' : 'car',
            disabled: unitBusy || busy,
            highlight: isRec,
            main: <><strong>Unité {u.name}</strong> · {u.kind === 'intervention' ? 'Intervention armée' : 'Patrouille'} {isRec && <Badge tone="success">Recommandée</Badge>} {u.gps && <Badge>GPS réel</Badge>}</>,
            sub: `${u.leader} · ${unitBusy ? `En mission (${u.alertId})` : u.alertId === a.id ? 'Déjà affectée' : 'Disponible'}`,
            side: <>{u.km.toFixed(1)} km<small className="block font-normal text-muted">~{etaMinutes(u.km)} min</small></>,
            onClick: async () => {
              const res = await act('assign', { unitId: u.id });
              if (res) { closeModal(); toast(`Unité ${res.unit.name} en route`, 'success'); }
            },
          };
        })} />
      </Modal>

      <Modal open={modal === 'call'} onClose={closeModal} title="Appeler">
        <Pick items={targets.map((t, i) => ({
          key: i, icon: t.icon, main: <strong>{t.name}</strong>, sub: t.sub, side: <span className="mono font-semibold">{t.phone}</span>,
          onClick: () => { setCalling({ ...t, started: Date.now() }); setModal('calling'); },
        }))} />
      </Modal>

      <Modal open={modal === 'calling'} onClose={closeModal} title="Appel en cours"
        footer={<Button variant="danger" onClick={async () => {
          const secs = Math.max(1, Math.round((Date.now() - calling.started) / 1000));
          await act('call', { target: `${calling.name} (${calling.phone}) — ${secs} s` });
          closeModal();
        }}><Icon name="phone" />Raccrocher</Button>}>
        {calling && (
          <div className="grid justify-items-center gap-2 py-4 text-center">
            <span className="grid size-20 animate-pulse place-items-center rounded-full bg-success-bg text-success ring-8 ring-success/10"><Icon name="phone" className="size-9" /></span>
            <strong className="mt-2 text-lg text-ink">{calling.name}</strong>
            <span className="mono text-muted">{calling.phone}</span>
            <p className="text-sm text-muted">Appel simulé (prototype)</p>
          </div>
        )}
      </Modal>

      <Modal open={modal === 'note'} onClose={closeModal} title={`Ajouter une note · ${a.id}`}
        footer={<><Button onClick={closeModal}>Annuler</Button><Button variant="primary" disabled={!note.trim() || busy} onClick={async () => { if (await act('note', { text: note.trim() })) closeModal(); }}>Enregistrer</Button></>}>
        <Field label="Note opérateur"><textarea autoFocus className={textareaCls} rows={4} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. : le témoin signale deux individus en moto rouge…" /></Field>
      </Modal>

      <Modal open={modal === 'close'} onClose={closeModal} title={`Clôturer · ${a.id}`}
        footer={<><Button onClick={closeModal}>Annuler</Button><Button variant="success" disabled={busy} onClick={async () => {
          if (await act('close', { outcome: outcome + (closeNote.trim() ? ` — ${closeNote.trim()}` : '') })) { closeModal(); toast('Intervention clôturée', 'success'); }
        }}><Icon name="flag" />Clôturer</Button></>}>
        <div className="grid gap-4">
          <Field label="Issue de l'intervention">
            <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
              {[...OUTCOMES[a.type], 'Fausse alerte / malveillance', 'Transféré aux services publics'].map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Commentaire (facultatif)"><textarea className={textareaCls} rows={3} maxLength={160} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} /></Field>
        </div>
      </Modal>
    </div>
  );
}
