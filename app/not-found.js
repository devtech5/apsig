export const metadata = { title: 'Page introuvable' };

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="mono text-sm font-bold text-accent">404</p>
        <h1 className="mt-2 text-2xl font-extrabold text-ink">Page introuvable</h1>
        <p className="mt-2 text-muted">Cette adresse n'existe pas ou n'est plus active.</p>
        <a href="/" className="mt-6 inline-flex h-11 items-center rounded-xl bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-700">Retour à l'accueil</a>
      </div>
    </main>
  );
}
