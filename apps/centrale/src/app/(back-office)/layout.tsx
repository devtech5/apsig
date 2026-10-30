import { CentraleProvider } from "@/components/Centrale";
import { Coque } from "@/components/Coque";
import { SessionProvider } from "@/components/Session";

// Toutes les pages du back-office partagent la session, la file en direct (et sa sirène) et la navigation.
export default function BackOffice({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <CentraleProvider>
        <Coque>{children}</Coque>
      </CentraleProvider>
    </SessionProvider>
  );
}
