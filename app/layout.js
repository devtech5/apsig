import { Inter, JetBrains_Mono } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains', display: 'swap' });

export const metadata = {
  title: { default: 'Code-Secours CI — APSIG', template: '%s — APSIG' },
  description: 'Prototype Code-Secours CI : plaque QR, page SOS, centrale de sécurité et unités terrain. Données fictives.',
  icons: { icon: { url: '/favicon.svg', type: 'image/svg+xml' } },
  manifest: '/manifest.webmanifest',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b2a63',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${inter.variable} ${mono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
