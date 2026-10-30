// Crée un compte du back-office ou réinitialise son mot de passe (et sa double authentification).
//   node apps/api/dist/auth/creer-compte.js --email awa@apsig.ci --nom "Awa K." --role OPERATEUR
//   node apps/api/dist/auth/creer-compte.js --email awa@apsig.ci   (nouveau mot de passe)
// Le premier compte de production est un SUPERADMIN, qui crée ensuite les autres depuis le back-office.
// Le mot de passe est généré et affiché une seule fois : il n'est stocké que haché.
import { parseArgs } from "node:util";
import { createPrismaClient, type RoleUtilisateur } from "@apsig/db";
import { ROLES, type Role } from "@apsig/domain";
import "../config.ts";
import { definirMotDePasse } from "./comptes.ts";

const { values } = parseArgs({ options: { email: { type: "string" }, nom: { type: "string" }, role: { type: "string" } } });
if (!values.email) throw new Error("--email est requis");
if (values.role && !ROLES.includes(values.role as Role)) throw new Error(`--role doit valoir ${ROLES.join(", ")}`);

const db = createPrismaClient();
try {
  const { utilisateur, motDePasse, cree } = await definirMotDePasse(db, {
    email: values.email,
    nom: values.nom,
    role: values.role as RoleUtilisateur | undefined,
  });
  console.log(`${cree ? "Compte créé" : "Mot de passe réinitialisé"} : ${utilisateur.email} (${utilisateur.role})`);
  console.log(`Mot de passe (affiché une seule fois) : ${motDePasse}`);
} finally {
  await db.$disconnect();
}
