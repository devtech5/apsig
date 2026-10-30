import { useState } from "react";
import { LIBELLES_STATUT, REPARTITION } from "@apsig/domain";
import type { AlerteResume, FileCentrale } from "@/lib/api";
import { dateHeure, duree } from "@/lib/format";
import { Icone, STYLE_URGENCE } from "./Icone";

type Props = {
  file: FileCentrale | null;
  selection: string | null;
  onChoisir: (numero: string) => void;
  agir: (chemin: string, corps: unknown) => Promise<void>;
  maintenant: number;
};

export function FileAlertes({ file, selection, onChoisir, agir, maintenant }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);
  if (!file) return <p className="p-4 text-sm text-attenue">Chargement de la file…</p>;

  const carte = (a: AlerteResume) => <Carte key={a.numero} a={a} active={a.numero === selection} onChoisir={onChoisir} maintenant={maintenant} />;
  const aAccepter = file.mesAlertes.filter((a) => !a.accepteeLe);
  const enCours = file.mesAlertes.filter((a) => a.accepteeLe);

  async function prendreSuivante() {
    setEnvoi(true);
    setErreur(null);
    try {
      await agir("/centrale/alertes/suivante", {});
    } catch (e) {
      setErreur((e as Error).message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <div className="grid content-start gap-4">
      {aAccepter.length > 0 && (
        <Section titre="À accepter" compte={aAccepter.length} urgent>
          {aAccepter.map(carte)}
        </Section>
      )}

      <Section titre="Mes alertes" compte={enCours.length}>
        {enCours.length === 0 && (
          <Vide>{file.presence === "EN_SERVICE" || file.equipe ? "Aucune alerte en cours" : "Prenez votre service pour recevoir des alertes"}</Vide>
        )}
        {enCours.map(carte)}
      </Section>

      <Section titre="File commune" compte={file.aPrendre.total} urgent={file.aPrendre.total > 0}>
        {file.aPrendre.total > 0 && (
          <button
            onClick={() => void prendreSuivante()}
            disabled={envoi}
            className="rounded-xl bg-danger px-4 py-3 text-sm font-black text-white shadow-sm disabled:opacity-60"
          >
            Prendre la suivante (la plus urgente)
          </button>
        )}
        {erreur && <p className="text-sm text-danger">{erreur}</p>}
        {file.aPrendre.total === 0 && <Vide>Aucune alerte en attente d'opérateur</Vide>}
        {file.aPrendre.alertes.map(carte)}
        {file.aPrendre.total > file.aPrendre.alertes.length && (
          <p className="text-center text-xs text-attenue">… et {file.aPrendre.total - file.aPrendre.alertes.length} de plus</p>
        )}
      </Section>

      {file.autres && file.autres.length > 0 && (
        <Section titre="Chez les autres opérateurs" compte={file.autres.length}>
          {file.autres.map(carte)}
        </Section>
      )}

      {file.recentes.length > 0 && (
        <section aria-label="Clôturées (24 h)" className="grid gap-1">
          <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">Clôturées (24 h)</h2>
          {file.recentes.map((a) => (
            <button
              key={a.numero}
              onClick={() => onChoisir(a.numero)}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm ${a.numero === selection ? "bg-brand-clair" : "hover:bg-white"}`}
            >
              <span className="truncate">
                <span className="font-mono text-xs text-attenue">{a.numero}</span> {a.urgence}
              </span>
              <span className="shrink-0 text-xs text-attenue">
                {LIBELLES_STATUT[a.statut]} · {a.clotureLe && dateHeure(a.clotureLe)}
              </span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function Section({ titre, compte, urgent, children }: { titre: string; compte: number; urgent?: boolean; children: React.ReactNode }) {
  return (
    <section aria-label={titre} className="grid gap-2">
      <h2 className="flex items-center justify-between text-xs font-bold tracking-wide text-attenue uppercase">
        {titre}
        <span className={`rounded-full px-2 py-0.5 text-white ${urgent ? "bg-danger" : "bg-brand"}`}>{compte}</span>
      </h2>
      {children}
    </section>
  );
}

function Vide({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-ligne bg-white px-4 py-4 text-center text-sm text-attenue">{children}</p>;
}

function Carte({ a, active, onChoisir, maintenant }: { a: AlerteResume; active: boolean; onChoisir: (n: string) => void; maintenant: number }) {
  const style = STYLE_URGENCE[a.type];
  const enAttente = !a.accepteeLe;
  // Temps restant pour accepter avant que l'alerte passe à un autre opérateur.
  const reste = a.attribueeLe && enAttente
    ? Math.max(0, REPARTITION.delaiAcceptationS - Math.floor((maintenant - new Date(a.attribueeLe).getTime()) / 1000))
    : null;
  return (
    <button
      onClick={() => onChoisir(a.numero)}
      aria-current={active}
      className={`relative grid gap-1 overflow-hidden rounded-xl bg-white py-3 pr-3 pl-5 text-left shadow-sm ring-2 ${active ? "ring-brand" : "ring-transparent hover:ring-ligne"}`}
    >
      <span className={`absolute inset-y-0 left-0 w-2 ${style.fond} ${enAttente ? "clignote" : ""}`} />
      <span className="flex items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 font-bold ${style.texte}`}>
          <Icone nom={style.icone} className="size-4" />
          {a.urgence}
        </span>
        <span className="shrink-0 font-mono text-sm font-bold whitespace-nowrap tabular-nums">{duree(a.creeLe, maintenant)}</span>
      </span>
      <span className="text-sm">{a.lieu ?? `${a.support.libelle} ${a.support.code}`}</span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-semibold ${enAttente ? "bg-danger text-white" : "bg-brand-clair text-brand"}`}>
          {enAttente && a.statut !== "NOUVELLE" ? "À reprendre" : LIBELLES_STATUT[a.statut]}
        </span>
        {reste !== null && <span className="rounded bg-alerte-fond px-1.5 py-0.5 font-semibold text-alerte-encre tabular-nums">à accepter : {reste} s</span>}
        {a.niveauEscalade > 0 && a.statut === "NOUVELLE" && (
          <span className="rounded bg-alerte-fond px-1.5 py-0.5 font-semibold text-alerte-encre">Escalade N{a.niveauEscalade}</span>
        )}
        {a.signaleeLe && <span className="rounded bg-danger-fond px-1.5 py-0.5 font-semibold text-danger">Signalée</span>}
        {a.temoinsRattaches > 0 && <span className="rounded bg-fond px-1.5 py-0.5">+{a.temoinsRattaches} témoin{a.temoinsRattaches > 1 ? "s" : ""}</span>}
        {a.redeclenchements > 0 && <span className="rounded bg-fond px-1.5 py-0.5">×{a.redeclenchements + 1}</span>}
        <span className="text-attenue">
          {a.numero}
          {a.attribueeA && ` · ${a.attribueeA.nom}`}
        </span>
      </span>
    </button>
  );
}
