import { Linking, Platform } from "react-native";
import type { Position, StatutAlerte, TypeUrgence } from "./types";

export type Mission = {
  numero: string;
  type: TypeUrgence;
  urgence: string;
  priorite: "CRITIQUE" | "HAUTE" | "NORMALE";
  statut: StatutAlerte;
  creeLe: string;
  engageeLe: string | null;
  termineeLe: string | null;
  support: { libelle: string; code: string };
  lieu: { libelle: string; adresse: string | null; quartier: string; ville: string; adresseVerifiee: boolean } | null;
  position: Position | null;
  temoin: { telephone: string | null; position: (Position & { le: string | null }) | null };
  personne: { prenom: string; nom: string; anneeNaissance: number | null } | null;
  journal: { le: string; texte: string }[];
};

export type EspaceTerrain = {
  unite: { id: string; nom: string; type: string; libelleType: string; statut: "DISPONIBLE" | "EN_MISSION" | "HORS_SERVICE" } | null;
  missions: Mission[];
};

// Itinéraire dans l'application de cartes du téléphone (Google Maps sur Android, Plans sur iPhone).
export function itineraire(p: Position) {
  const url = Platform.OS === "ios" ? `maps://?daddr=${p.lat},${p.lng}&dirflg=d` : `google.navigation:q=${p.lat},${p.lng}`;
  void Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`));
}
