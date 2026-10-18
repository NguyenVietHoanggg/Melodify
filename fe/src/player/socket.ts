/**
 * WebSocket connection to the backend hub: receives the player state whenever it changes on ANY device,
 * and registers this tab as a Connect device. Reconnects with exponential backoff (1s, 2s, 4s … 30s).
 */
import type { PlayerView } from '@contracts';
import { deviceId, deviceName } from '@/lib/device';
import { audioEngine } from './engine';
import { refreshPlayer } from './commands';
import { usePlayer } from './store';

let ws: WebSocket | null = null;
let retry = 0;
let timer = 0;
let wanted = false;

function url() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const q = new URLSearchParams({ deviceId, name: deviceName, type: 'web', platform: 'web' });
  return `${proto}://${location.host}/api/ws?${q}`;
}

function open() {
  if (!wanted) return;
  ws = new WebSocket(url());
  ws.onopen = () => {
    retry = 0;
    void refreshPlayer();
    reportVolume();
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data)) as { type: string; view?: PlayerView; command?: string; volume?: number };
    if (msg.type === 'player' && msg.view) usePlayer.getState().setView(msg.view);
    if (msg.type === 'command' && msg.command === 'volume' && typeof msg.volume === 'number') {
      usePlayer.getState().setVolume(msg.volume);
      audioEngine.setVolume(msg.volume, false);
      reportVolume();
    }
  };
  ws.onclose = () => {
    ws = null;
    if (!wanted) return;
    const delay = Math.min(30_000, 1000 * 2 ** retry++);
    timer = window.setTimeout(open, delay);
  };
}

export function connectSocket() {
  if (wanted) return;
  wanted = true;
  open();
}

export function disconnectSocket() {
  wanted = false;
  window.clearTimeout(timer);
  ws?.close();
}

let volTimer = 0;
export function reportVolume() {
  window.clearTimeout(volTimer);
  volTimer = window.setTimeout(() => {
    const { volume, muted } = usePlayer.getState();
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'volume', volume: muted ? 0 : volume }));
  }, 300);
}

usePlayer.subscribe((s, prev) => {
  if (s.volume !== prev.volume || s.muted !== prev.muted) reportVolume();
});
