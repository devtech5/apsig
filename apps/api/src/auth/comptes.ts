import { hashPassword } from "better-auth/crypto";
import type { PrismaClient, RoleUtilisateur } from "@apsig/db";
import { z } from "zod";
import { genererJeton, MOT_DE_PASSE } from "@apsig/domain";

// Mot de passe provisoire choisi par un responsable à la création d'un compte.
export const motDePasseProvisoire = z
  .string()
  .min(MOT_DE_PASSE.provisoireMin, `Mot de passe provisoire : ${MOT_DE_PASSE.provisoireMin} caractères au moins`)
  .max(MOT_DE_PASSE.max);

// Crée l'utilisateur s'il n'existe pas, puis (re)définit son mot de passe Better Auth.
// Le compte « credential » est celui que Better Auth consulte à la connexion par e-mail.
// Réinitialiser le mot de passe réinitialise aussi la double authentification (téléphone perdu) :
// l'utilisateur l'active de nouveau à sa prochaine connexion.
// Ce mot de passe, choisi par un responsable ou généré, est provisoire : l'utilisateur le remplace à sa première connexion.
export async function definirMotDePasse(
  db: PrismaClient,
  u: { email: string; nom?: string | undefined; role?: RoleUtilisateur | undefined },
  motDePasse: string = genererJeton(16),
) {
  const email = u.email.trim().toLowerCase();
  const existant = await db.utilisateur.findUnique({ where: { email } });
  if (!existant && (!u.nom || !u.role)) throw new Error(`Aucun compte pour ${email} : --nom et --role sont requis pour le créer`);
  const utilisateur = existant
    ? await db.utilisateur.update({
        where: { id: existant.id },
        data: { actif: true, deuxFacteurs: false, motDePasseProvisoire: true, ...(u.nom && { nom: u.nom }), ...(u.role && { role: u.role }) },
      })
    : await db.utilisateur.create({ data: { email, nom: u.nom!, role: u.role!, motDePasseProvisoire: true } });
  await db.secondFacteur.deleteMany({ where: { userId: utilisateur.id } });

  const password = await hashPassword(motDePasse);
  const compte = await db.compte.findFirst({ where: { userId: utilisateur.id, providerId: "credential" } });
  if (compte) await db.compte.update({ where: { id: compte.id }, data: { password } });
  else await db.compte.create({ data: { id: genererJeton(24), accountId: utilisateur.id, providerId: "credential", userId: utilisateur.id, password } });
  // Un nouveau mot de passe ferme les sessions ouvertes.
  await db.session.deleteMany({ where: { userId: utilisateur.id } });
  return { utilisateur, motDePasse, cree: !existant };
}
