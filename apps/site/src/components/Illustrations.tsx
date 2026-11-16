import { Icone, type NomIcone } from "./Icone";

// Motif de QR purement décoratif (non lisible) : trois repères d'angle et des modules pseudo-aléatoires fixes.
const TAILLE = 25;
function modules(): [number, number][] {
  const cases: [number, number][] = [];
  let graine = 7;
  const repere = (x: number, y: number) => (x < 8 && y < 8) || (x > TAILLE - 9 && y < 8) || (x < 8 && y > TAILLE - 9);
  for (let y = 0; y < TAILLE; y++) {
    for (let x = 0; x < TAILLE; x++) {
      graine = (graine * 1103515245 + 12345) % 2147483648;
      if (!repere(x, y) && graine % 100 < 46) cases.push([x, y]);
    }
  }
  return cases;
}
const MODULES = modules();

function Repere({ x, y }: { x: number; y: number }) {
  return (
    <>
      <rect x={x} y={y} width={7} height={7} fill="currentColor" />
      <rect x={x + 1} y={y + 1} width={5} height={5} fill="white" />
      <rect x={x + 2} y={y + 2} width={3} height={3} fill="currentColor" />
    </>
  );
}

export function QrDecoratif({ className = "" }: { className?: string }) {
  return (
    <svg viewBox={`-1 -1 ${TAILLE + 2} ${TAILLE + 2}`} className={className} aria-hidden="true" shapeRendering="crispEdges">
      <rect x={-1} y={-1} width={TAILLE + 2} height={TAILLE + 2} fill="white" />
      {MODULES.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" />
      ))}
      <Repere x={0} y={0} />
      <Repere x={TAILLE - 7} y={0} />
      <Repere x={0} y={TAILLE - 7} />
    </svg>
  );
}

// Plaque portail : aluminium, seulement le code de la plaque et le QR (aucun nom, aucun numéro imprimé).
export function Plaque({ className = "w-56" }: { className?: string }) {
  return (
    <figure
      aria-label="Plaque portail CODE-SECOURS : un code et un QR, sans nom ni adresse"
      className={`relative grid gap-3 rounded-[1.4rem] bg-gradient-to-br from-white via-[#eef1f5] to-[#cfd6e0] p-4 shadow-[0_30px_60px_-20px_rgb(11_26_58_/_0.55)] ring-1 ring-white/70 ${className}`}
    >
      {[["top-2.5 left-2.5"], ["top-2.5 right-2.5"], ["bottom-2.5 left-2.5"], ["bottom-2.5 right-2.5"]].map(([p]) => (
        <span key={p} aria-hidden="true" className={`absolute ${p} size-2 rounded-full bg-gradient-to-br from-slate-300 to-slate-500 ring-1 ring-white`} />
      ))}
      <div className="flex items-center justify-center gap-2 rounded-xl bg-marine px-3 py-2 text-white">
        <img src="/logo-apsig.svg" alt="" width={18} height={20} className="h-5 w-[18px]" />
        <span className="font-titre text-xs font-extrabold tracking-wide whitespace-nowrap sm:text-sm">CODE-SECOURS</span>
        <span className="rounded bg-orange px-1 text-xs font-black">CI</span>
      </div>
      <QrDecoratif className="mx-auto w-[72%] text-nuit" />
      <p className="text-center font-mono text-sm font-bold tracking-[0.18em] text-nuit">DAL-LOBIA-053</p>
    </figure>
  );
}

const URGENCES: { libelle: string; detail: string; fond: string; icone: NomIcone }[] = [
  { libelle: "Agression · Vol", detail: "Police, sécurité, famille", fond: "bg-signal", icone: "bouclier" },
  { libelle: "Malaise · Accident", detail: "GSPM, SAMU, famille", fond: "bg-orange", icone: "coeur" },
  { libelle: "Incendie", detail: "GSPM, voisinage", fond: "bg-[#1d4ed8]", icone: "flamme" },
  { libelle: "Enfant égaré", detail: "Famille, puis Police", fond: "bg-[#7e22ce]", icone: "enfant" },
];

// Écran de la page d'alerte, tel que le voit le témoin après le scan.
export function Telephone({ className = "" }: { className?: string }) {
  return (
    <figure
      aria-label="Écran de la page d'alerte : le témoin choisit le type d'urgence"
      className={`w-[17rem] rounded-[2.6rem] bg-nuit p-2.5 shadow-[0_40px_80px_-24px_rgb(11_26_58_/_0.7)] ring-1 ring-white/10 ${className}`}
    >
      <div className="overflow-hidden rounded-[2.1rem] bg-[#eef2f7]">
        <div className="bg-brand px-4 pt-6 pb-8 text-center text-white">
          <p className="font-titre text-sm font-extrabold tracking-wide">CODE-SECOURS CI</p>
          <p className="text-[10px] tracking-widest text-white/70 uppercase">Centrale APSIG 24h/24</p>
        </div>
        <div className="-mt-5 grid gap-2 px-3 pb-4">
          <div className="rounded-xl bg-white px-3 py-2 shadow-sm">
            <p className="font-mono text-xs font-bold text-nuit">DAL-LOBIA-053</p>
            <p className="flex items-center gap-1 text-[10px] text-attenue">
              <Icone nom="repere" className="size-3" /> Plaque portail · quartier Lobia
            </p>
          </div>
          <p className="pt-1 text-center font-titre text-sm font-extrabold text-nuit">Quelle est l'urgence ?</p>
          {URGENCES.map((u) => (
            <div key={u.libelle} className={`flex items-center gap-2.5 rounded-xl ${u.fond} px-3 py-2.5 text-white`}>
              <Icone nom={u.icone} className="size-5 shrink-0" />
              <span className="leading-tight">
                <span className="block text-xs font-extrabold">{u.libelle}</span>
                <span className="block text-[10px] text-white/80">{u.detail}</span>
              </span>
            </div>
          ))}
          <div className="rounded-xl bg-slate-300 py-2 text-center text-[11px] font-bold text-slate-600">Je me suis trompé — Annuler</div>
        </div>
      </div>
    </figure>
  );
}
