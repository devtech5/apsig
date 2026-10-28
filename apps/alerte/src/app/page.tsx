import { Cadre, NumerosPublics } from "@/components/Cadre";

export default function Accueil() {
  return (
    <Cadre>
      <section className="rounded-3xl bg-white p-6 text-center shadow-lg">
        <h1 className="text-xl font-extrabold">Scannez un QR code CODE-SECOURS</h1>
        <p className="mt-2 text-attenue">
          Les plaques, bracelets et cartes APSIG ouvrent directement la page d'alerte du support scanné.
        </p>
      </section>
      <NumerosPublics />
    </Cadre>
  );
}
