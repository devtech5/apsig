import Terrain from '@/components/pages/Terrain';

export const metadata = { title: 'Terrain', manifest: '/manifest.webmanifest' };
export const viewport = { themeColor: '#060f20' };

export default function Page() {
  return <Terrain />;
}
