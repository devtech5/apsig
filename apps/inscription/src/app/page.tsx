import { FormulaireInscription } from "@/components/FormulaireInscription";

export default function Accueil() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-center gap-3 bg-brand px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-12 text-white">
        <img src="/logo-apsig.svg" alt="" width={36} height={40} className="h-10 w-9" />
        <div>
          <p className="text-xl leading-tight font-black tracking-wide">CODE-SECOURS CI</p>
          <p className="text-xs font-semibold tracking-widest text-white/70 uppercase">APSIG · Inscription en ligne</p>
        </div>
      </header>
      <main className="mx-auto -mt-8 w-full max-w-xl flex-1 px-4 pb-8">
        <FormulaireInscription />
      </main>
      <footer className="px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-xs text-attenue">
        Service APSIG · CODE-SECOURS ne remplace pas les numéros d'urgence publics.
      </footer>
    </div>
  );
}
