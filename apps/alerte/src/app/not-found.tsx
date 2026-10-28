import { PageErreur } from "@/components/Cadre";

export default function Introuvable() {
  return <PageErreur titre="Page introuvable" message="Cette adresse ne correspond à aucun QR code. En cas d'urgence, appelez directement les secours." />;
}
