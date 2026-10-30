// Briques communes des formulaires du back-office (espaces abonnements et administration).

export const CHAMP = "w-full rounded-lg border border-ligne bg-white px-3 py-2 text-sm font-normal focus:border-brand focus:outline-none";
export const BOUTON = "rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white disabled:opacity-60";
export const BOUTON_SECONDAIRE = "rounded-lg border border-brand bg-white px-3 py-1.5 text-sm font-bold text-brand disabled:opacity-60";
export const BOUTON_DISCRET = "rounded-lg px-3 py-1.5 text-sm text-attenue hover:bg-fond disabled:opacity-60";

export function Bloc({ titre, action, children }: { titre: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold tracking-wide text-attenue uppercase">{titre}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Champ({ libelle, aide, className, children }: { libelle: string; aide?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid content-start gap-1 text-sm font-semibold ${className ?? ""}`}>
      {libelle}
      {children}
      {aide && <span className="text-xs font-normal text-attenue">{aide}</span>}
    </label>
  );
}

export function Erreur({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-fond px-4 py-3 text-sm font-semibold text-danger">
      {message}
    </p>
  );
}

// Valeur texte d'un champ de formulaire, null si vide.
export const valeur = (f: FormData, nom: string) => {
  const v = String(f.get(nom) ?? "").trim();
  return v === "" ? null : v;
};
