// Villes de Côte d'Ivoire proposées au recensement : chefs-lieux de département et grandes villes. Liste de départ :
// une ville absente se saisit à la main et s'ajoute au référentiel APSIG (de même pour une commune ou un quartier).
export const VILLES_CI = [
  "Abengourou", "Abidjan", "Aboisso", "Adiaké", "Adzopé", "Agboville", "Agnibilékrou", "Akoupé", "Alépé", "Anyama",
  "Arrah", "Attiégouakro", "Ayamé", "Bangolo", "Béoumi", "Bettié", "Biankouma", "Bingerville", "Bloléquin", "Bocanda",
  "Bondoukou", "Bongouanou", "Bonon", "Botro", "Bouaflé", "Bouaké", "Bouna", "Boundiali", "Buyo", "Dabakala",
  "Dabou", "Daloa", "Danané", "Daoukro", "Dianra", "Didiévi", "Dikodougou", "Dimbokro", "Divo", "Djékanou",
  "Doropo", "Duékoué", "Facobly", "Ferkessédougou", "Fresco", "Gagnoa", "Gohitafla", "Grand-Bassam", "Grand-Lahou", "Guéyo",
  "Guiglo", "Guitry", "Issia", "Jacqueville", "Kani", "Kaniasso", "Katiola", "Kong", "Korhogo", "Kouibly",
  "Koun-Fao", "Kounahiri", "Kouto", "Lakota", "Madinani", "Man", "Mankono", "M'Bahiakro", "M'Batto", "Méagui",
  "Minignan", "Niakaramadougou", "Nassian", "Odienné", "Ouangolodougou", "Ouaninou", "Ouellé", "Oumé", "Prikro", "Sakassou",
  "Sandégué", "San-Pédro", "Sassandra", "Séguéla", "Sikensi", "Sinématiali", "Sinfra", "Sipilou", "Songon", "Soubré",
  "Taabo", "Tabou", "Taï", "Tanda", "Téhini", "Tengréla", "Tiapoum", "Tiassalé", "Tiébissou", "Touba",
  "Toulépleu", "Toumodi", "Transua", "Vavoua", "Yakassé-Attobrou", "Yamoussoukro", "Zouan-Hounien", "Zoukougbeu", "Zuénoula",
] as const;

// Communes connues d'avance : les dix communes de la ville d'Abidjan. Ailleurs, la commune est facultative
// et s'ajoute au besoin.
export const COMMUNES_CI: Readonly<Record<string, readonly string[]>> = {
  Abidjan: ["Abobo", "Adjamé", "Attécoubé", "Cocody", "Koumassi", "Marcory", "Plateau", "Port-Bouët", "Treichville", "Yopougon"],
};

// Clé de comparaison : « Port-Bouët », « port bouet » et « PORT-BOUET » désignent le même lieu.
export const cleLieu = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();

// Nom saisi à la main, remis en forme : espaces superflus retirés, première lettre en majuscule.
export const nomLieu = (saisie: string) => {
  const s = saisie.trim().replace(/\s+/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Code d'un nouveau lieu, à partir de son nom : sert dans le code des plaques (DAL-LOBIA-053, ABJ-YOP-NIANGON-053).
// Villes et communes : 3 lettres ; quartiers : le nom, 15 caractères au plus. `pris` évite les doublons.
export function codeLieu(nom: string, nature: "ville" | "commune" | "quartier", pris: ReadonlySet<string>) {
  const base = cleLieu(nom).replace(/ /g, nature === "quartier" ? "-" : "");
  const candidats =
    nature === "quartier"
      ? [base.slice(0, 15)]
      : [base.slice(0, 3), base[0]! + base.slice(1).replace(/[AEIOUY]/g, "").slice(0, 2), base.slice(0, 2) + base.slice(-1)];
  for (const c of candidats) if (c.length >= (nature === "quartier" ? 2 : 3) && !pris.has(c)) return c;
  const racine = candidats[0]!.slice(0, nature === "quartier" ? 13 : 2);
  for (let i = 2; ; i++) if (!pris.has(`${racine}${i}`)) return `${racine}${i}`;
}
