import { Cadre, NumerosPublics } from "@/components/Cadre";
import { ScannerQr } from "@/components/ScannerQr";

export default function Accueil() {
  return (
    <Cadre>
      <ScannerQr />
      <NumerosPublics />
    </Cadre>
  );
}
