"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cleLieu } from "@apsig/domain";
import { CHAMP } from "./Formulaire";

// Liste déroulante avec saisie libre : la flèche ou le clic affiche toute la liste, la frappe la filtre ;
// un nom absent est gardé tel quel (l'API l'ajoute au référentiel).
export function ListeSaisie({
  libelle,
  valeur,
  options,
  onChange,
  requis = false,
  placeholder = "Choisir ou saisir",
  ajout = "il sera ajouté",
}: {
  libelle: string;
  valeur: string;
  options: string[];
  onChange: (v: string) => void;
  requis?: boolean;
  placeholder?: string;
  ajout?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [filtrer, setFiltrer] = useState(false);
  const [actif, setActif] = useState(0);
  const boite = useRef<HTMLDivElement>(null);
  const id = useId();

  // Liste complète à l'ouverture ; filtrée seulement quand on tape.
  const recherche = cleLieu(valeur);
  const proposes = filtrer && recherche ? options.filter((o) => cleLieu(o).includes(recherche)) : options;
  const nouveau = valeur.trim() !== "" && !options.some((o) => cleLieu(o) === recherche);

  useEffect(() => {
    if (!ouvert) return;
    const fermer = (e: MouseEvent) => !boite.current?.contains(e.target as Node) && setOuvert(false);
    document.addEventListener("mousedown", fermer);
    return () => document.removeEventListener("mousedown", fermer);
  }, [ouvert]);

  const choisir = (o: string) => {
    onChange(o);
    setOuvert(false);
    setFiltrer(false);
  };

  return (
    <div ref={boite} className="relative grid content-start gap-1 text-sm font-semibold">
      <label htmlFor={id}>{libelle}</label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={ouvert}
          aria-controls={`${id}-liste`}
          aria-autocomplete="list"
          value={valeur}
          onChange={(e) => {
            onChange(e.target.value);
            setFiltrer(true);
            setOuvert(true);
            setActif(0);
          }}
          onFocus={() => setOuvert(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOuvert(true);
              setActif((a) => Math.min(a + 1, proposes.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActif((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && ouvert && proposes[actif]) {
              e.preventDefault();
              choisir(proposes[actif]!);
            } else if (e.key === "Escape") setOuvert(false);
          }}
          required={requis}
          maxLength={80}
          autoComplete="off"
          placeholder={placeholder}
          className={`${CHAMP} pr-9`}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Afficher la liste : ${libelle}`}
          onClick={() => {
            setFiltrer(false);
            setOuvert((o) => !o);
          }}
          className="absolute inset-y-0 right-0 px-3 text-attenue hover:text-encre"
        >
          ▾
        </button>
      </div>
      {ouvert && proposes.length > 0 && (
        <ul id={`${id}-liste`} role="listbox" className="absolute top-full right-0 left-0 z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-ligne bg-white py-1 font-normal shadow-lg">
          {proposes.map((o, i) => (
            <li
              key={o}
              role="option"
              aria-selected={cleLieu(o) === recherche}
              onMouseDown={(e) => {
                e.preventDefault();
                choisir(o);
              }}
              onMouseEnter={() => setActif(i)}
              className={`cursor-pointer px-3 py-2 ${i === actif ? "bg-brand-clair" : ""} ${cleLieu(o) === recherche ? "font-bold text-brand" : ""}`}
            >
              {o}
            </li>
          ))}
        </ul>
      )}
      {nouveau && <span className="text-xs font-normal text-attenue">Absent de la liste : {ajout}.</span>}
    </div>
  );
}
