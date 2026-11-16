"use client";

import { ClientsRecenses } from "@/components/ClientsRecenses";

// QG : tous les clients recensés sur le terrain, avec le code de leur plaque (matricule) et leurs QR dès le recensement,
// qu'ils aient payé ou non, avant même la pose.
export default function PageClients() {
  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="grid gap-1">
        <h1 className="text-xl font-black">Clients recensés</h1>
        <p className="text-sm text-attenue">
          Chaque client reçoit son code Code-Secours (le code de sa plaque) et ses QR dès la validation du recensement. Les 100 plus récents sont affichés :
          recherchez par nom, code de plaque ou téléphone pour retrouver les autres.
        </p>
      </div>
      <ClientsRecenses titre="Tous les clients" montrerRecenseur />
    </div>
  );
}
