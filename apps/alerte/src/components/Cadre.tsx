import { NUMEROS_PUBLICS } from "@/lib/urgences";
import { Icone } from "./Icone";

// En-tête et pied communs à toutes les pages du témoin.
export function Cadre({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-center gap-3 bg-brand px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-10 text-white">
        <img src="/logo-apsig.svg" alt="" width={36} height={40} className="h-10 w-9" />
        <div>
          <p className="text-xl leading-tight font-black tracking-wide">CODE-SECOURS CI</p>
          <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">APSIG · Centrale 24h/24</p>
        </div>
      </header>
      <main aria-live="polite" className="mx-auto -mt-7 grid w-full max-w-md flex-1 content-start gap-4 px-4 pb-6">
        {children}
      </main>
      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-attenue">
        Aucune application à installer · Service APSIG
      </footer>
    </div>
  );
}

// Toujours visible : le service facilite la transmission, il ne remplace pas les numéros publics.
export function NumerosPublics({ titre = "Numéros d'urgence publics" }: { titre?: string }) {
  return (
    <section aria-labelledby="numeros" className="rounded-2xl border border-ligne bg-white p-4">
      <h2 id="numeros" className="text-xs font-bold tracking-wide text-attenue uppercase">{titre}</h2>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {NUMEROS_PUBLICS.map((n) => (
          <a
            key={n.numero}
            href={`tel:${n.numero}`}
            className="grid justify-items-center rounded-xl bg-fond px-2 py-3 ring-1 ring-ligne active:bg-brand-clair"
          >
            <span className="flex items-center gap-1 font-mono text-xl font-extrabold text-encre">
              <Icone nom="telephone" className="size-4" />
              {n.numero}
            </span>
            <span className="text-xs text-attenue">{n.service}</span>
          </a>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-attenue">CODE-SECOURS ne remplace pas les numéros d'urgence publics.</p>
    </section>
  );
}

export function PageErreur({ titre, message }: { titre: string; message: string }) {
  return (
    <Cadre>
      <section className="grid justify-items-center gap-3 rounded-3xl bg-white px-6 py-10 text-center shadow-lg">
        <span className="grid size-14 place-items-center rounded-2xl bg-alerte-fond text-alerte-encre">
          <Icone nom="alerte" className="size-7" />
        </span>
        <h1 className="text-xl font-extrabold">{titre}</h1>
        <p className="text-attenue">{message}</p>
      </section>
      <NumerosPublics titre="Appelez directement les secours" />
    </Cadre>
  );
}
