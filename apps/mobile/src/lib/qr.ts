// Le QR APSIG encode l'adresse de la page d'alerte : https://alerte.…/s/<jeton>.
export const jetonDuQr = (texte: string) => /\/s\/([A-Za-z0-9]{6,64})(?:[/?#]|$)/.exec(texte.trim())?.[1] ?? null;
