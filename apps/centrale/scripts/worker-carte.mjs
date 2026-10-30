// Copie le worker de MapLibre dans public/ : son adresse est calculée à l'exécution,
// le bundler ne peut donc pas l'embarquer (cf. setWorkerUrl dans src/components/Carte.tsx).
import { copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json"));
copyFileSync(path.join(dist, "dist/maplibre-gl-worker.mjs"), path.resolve(import.meta.dirname, "../public/maplibre-gl-worker.js"));
