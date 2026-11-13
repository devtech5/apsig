import { useMemo } from "react";
import { View } from "react-native";
import QRCode from "qrcode";

// QR dessiné avec des vues (aucun module natif) : chaque suite de modules noirs d'une ligne devient un seul rectangle.
export function QrCode({ valeur, taille = 200 }: { valeur: string; taille?: number }) {
  const { lignes, cote } = useMemo(() => {
    const { modules } = QRCode.create(valeur, { errorCorrectionLevel: "H" });
    const n = modules.size;
    const lignes: { debut: number; longueur: number }[][] = [];
    for (let y = 0; y < n; y++) {
      const segments: { debut: number; longueur: number }[] = [];
      let x = 0;
      while (x < n) {
        if (!modules.get(y, x)) {
          x++;
          continue;
        }
        const debut = x;
        while (x < n && modules.get(y, x)) x++;
        segments.push({ debut, longueur: x - debut });
      }
      lignes.push(segments);
    }
    return { lignes, cote: n };
  }, [valeur]);

  // Marge blanche de 2 modules autour du QR, indispensable à la lecture.
  const module = taille / (cote + 4);
  return (
    <View style={{ width: taille, height: taille, backgroundColor: "#fff", padding: module * 2 }} accessibilityRole="image" accessibilityLabel="QR code">
      {lignes.map((segments, y) => (
        <View key={y} style={{ height: module, flexDirection: "row" }}>
          {segments.map((s) => (
            <View key={s.debut} style={{ position: "absolute", left: s.debut * module, width: s.longueur * module, height: module, backgroundColor: "#000" }} />
          ))}
        </View>
      ))}
    </View>
  );
}
