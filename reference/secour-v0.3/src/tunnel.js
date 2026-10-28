import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

// Tunnel HTTPS public via Cloudflare (« quick tunnel », sans compte) :
// les téléphones joignent le prototype même si le Wi-Fi isole les appareils.
const CANDIDATES = [
  process.env.CLOUDFLARED,
  'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
  'C:\\Program Files\\cloudflared\\cloudflared.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}\\Microsoft\\WinGet\\Links\\cloudflared.exe`,
  '/usr/local/bin/cloudflared',
  '/opt/homebrew/bin/cloudflared',
];

export function startTunnel({ port, onUrl, log = console.log }) {
  const exe = CANDIDATES.find((c) => c && existsSync(c)) ?? 'cloudflared';
  let found = null;
  let stopped = false;
  let child;

  const launch = () => {
    child = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true });
    const scan = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && m[0] !== found) {
        found = m[0];
        onUrl(found);
      }
    };
    child.stdout.on('data', scan);
    child.stderr.on('data', scan);
    child.on('error', (err) => {
      log(`  Tunnel indisponible (${err.message}). Installez cloudflared : winget install Cloudflare.cloudflared`);
      stopped = true;
    });
    child.on('exit', () => {
      if (stopped) return;
      log('  Tunnel interrompu, nouvelle tentative dans 5 s…');
      found = null;
      onUrl(null);
      setTimeout(launch, 5000).unref();
    });
  };

  launch();
  const stop = () => { stopped = true; child?.kill(); };
  process.on('exit', stop);
  return { stop, get url() { return found; } };
}
