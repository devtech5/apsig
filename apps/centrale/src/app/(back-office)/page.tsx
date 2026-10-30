"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { accueilDe } from "@/components/Coque";
import { useSession } from "@/components/Session";
import { TableauDeBord } from "@/components/TableauDeBord";

export default function Accueil() {
  const { compte } = useSession();
  const router = useRouter();
  const centrale = compte.espaces.includes("centrale");

  // Conseiller abonnements : pas de file d'alertes, on ouvre son espace.
  useEffect(() => {
    if (!centrale) router.replace(accueilDe(compte.espaces));
  }, [centrale, compte.espaces, router]);

  return centrale ? <TableauDeBord /> : null;
}
