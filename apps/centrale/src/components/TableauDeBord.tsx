"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { type AlerteDetail, appelApi, ErreurApi } from "@/lib/api";
import { useMaintenant } from "@/lib/format";
import { useCentrale } from "./Centrale";
import { FicheAlerte } from "./FicheAlerte";
import { FileAlertes } from "./FileAlertes";

export function TableauDeBord() {
  const router = useRouter();
  const maintenant = useMaintenant();
  const { file, version, rafraichir } = useCentrale()!;
  const [selection, setSelection] = useState<string | null>(null);
  const [detail, setDetail] = useState<AlerteDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  // Sélection lue par les requêtes en cours : une réponse arrivée après un changement d'alerte est ignorée,
  // pour que la fiche affichée soit toujours celle de l'alerte surlignée.
  const selectionRef = useRef<string | null>(null);

  const selectionner = useCallback((numero: string | null) => {
    selectionRef.current = numero;
    setSelection(numero);
  }, []);
  const afficher = useCallback((d: AlerteDetail) => {
    if (d.numero === selectionRef.current) setDetail(d);
  }, []);

  const charger = useCallback(
    async (numero: string) => {
      try {
        afficher(await appelApi<AlerteDetail>(`/centrale/alertes/${numero}`));
        setErreur(null);
      } catch (e) {
        if (e instanceof ErreurApi && e.statut === 401) router.replace("/connexion");
        // Réattribuée entre-temps à un autre opérateur : la fiche n'est plus lisible.
        else if (numero === selectionRef.current) {
          setDetail(null);
          setErreur((e as Error).message);
        }
      }
    },
    [afficher, router],
  );

  // Alerte demandée depuis la carte (/?alerte=ALR-000123).
  useEffect(() => {
    const demandee = new URLSearchParams(window.location.search).get("alerte");
    if (demandee) selectionner(demandee);
  }, [selectionner]);

  // Rien de sélectionné : on ouvre d'office ce qui attend le plus.
  useEffect(() => {
    if (!file || selectionRef.current) return;
    const premiere = file.mesAlertes[0] ?? file.aPrendre.alertes[0] ?? file.autres?.[0];
    if (premiere) selectionner(premiere.numero);
  }, [file, selectionner]);

  // La fiche ouverte suit les changements signalés par le flux.
  useEffect(() => {
    if (selection) void charger(selection);
  }, [selection, version, charger]);

  function choisir(numero: string) {
    if (numero === selectionRef.current) return;
    setDetail(null);
    setErreur(null);
    selectionner(numero);
  }

  async function agir(chemin: string, corps: unknown) {
    const d = await appelApi<AlerteDetail>(chemin, corps).catch((e: unknown) => {
      if (e instanceof ErreurApi && e.statut === 401) router.replace("/connexion");
      throw e;
    });
    // « Prendre la suivante » ouvre l'alerte prise.
    if (d.numero !== selectionRef.current) selectionner(d.numero);
    afficher(d);
    void rafraichir();
  }

  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[23rem_1fr]">
      <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100dvh-6rem)] lg:overflow-x-hidden lg:overflow-y-auto">
        <FileAlertes file={file} selection={selection} onChoisir={choisir} agir={agir} maintenant={maintenant} />
      </aside>
      <main>
        {detail ? (
          <FicheAlerte key={detail.numero} a={detail} maintenant={maintenant} agir={agir} onChoisir={choisir} equipe={file?.equipe} />
        ) : (
          <div className="grid h-full min-h-60 place-items-center rounded-2xl border border-dashed border-ligne p-6 text-center text-attenue">
            {erreur ?? (selection ? "Chargement de l'alerte…" : "Aucune alerte à traiter")}
          </div>
        )}
      </main>
    </div>
  );
}
