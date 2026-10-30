import { hashPassword } from "better-auth/crypto";
import type { PrismaClient, RoleUtilisateur } from "@apsig/db";
import { genererJeton } from "@apsig/domain";

// Crée l'utilisateur s'il n'existe pas, puis (re)définit son mot de passe Better Auth.
// Le compte « credential » est celui que Better Auth consulte à la connexion par e-mail.
// Réinitialiser le mot de passe réinitialise aussi la double authentification (téléphone perdu) :
// l'utilisateur l'active de nouveau à sa prochaine connexion.
export async function definirMotDePasse(
  db: PrismaClient,
  u: { email: string; nom?: string | undefined; role?: RoleUtilisateur | undefined },
  motDePasse = genererJeton(16),
) {
  const email = u.email.trim().toLowerCase();
  const existant = await db.utilisateur.findUnique({ where: { email } });
  if (!existant && (!u.nom || !u.role)) throw new Error(`Aucun compte pour ${email} : --nom et --role sont requis pour le créer`);
  const utilisateur = existant
    ? await db.utilisateur.update({
        where: { id: existant.id },
        data: { actif: true, deuxFacteurs: false, ...(u.nom && { nom: u.nom }), ...(u.role && { role: u.role }) },
      })
    : await db.utilisateur.create({ data: { email, nom: u.nom!, role: u.role! } });
  await db.secondFacteur.deleteMany({ where: { userId: utilisateur.id } });

  const password = await hashPassword(motDePasse);
  const compte = await db.compte.findFirst({ where: { userId: utilisateur.id, providerId: "credential" } });
  if (compte) await db.compte.update({ where: { id: compte.id }, data: { password } });
  else await db.compte.create({ data: { id: genererJeton(24), accountId: utilisateur.id, providerId: "credential", userId: utilisateur.id, password } });
  // Un nouveau mot de passe ferme les sessions ouvertes.
  await db.session.deleteMany({ where: { userId: utilisateur.id } });
  return { utilisateur, motDePasse, cree: !existant };
}
