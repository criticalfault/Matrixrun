import type { RunPacket, RunPacketWithGMData } from '@/types';

const FILE_EXTENSION = '.mxrun';
const VERSION = '1.0';

// ─── Encryption (Web Crypto API — AES-GCM, fixed app key) ────────────────────

// Not a user secret — just prevents the file from being plain-readable JSON.
const APP_KEY_MATERIAL = 'MatrixRun-SR3-AppKey-2025-Internal';
const APP_KEY_SALT     = 'MatrixRun-SR3-Salt-v1';

async function getAppKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(APP_KEY_MATERIAL),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode(APP_KEY_SALT), iterations: 100_000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptData(data: string): Promise<string> {
  const key = await getAppKey();
  const iv  = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(data));
  const combined = new Uint8Array(iv.byteLength + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.byteLength);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encoded: string): Promise<string> {
  const key      = await getAppKey();
  const combined = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const iv         = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  const decrypted  = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Export a run packet as an encrypted .mxrun file.
 * GM notes are stripped before encryption.
 * Returns a Blob the caller can trigger a download of.
 */
export async function exportRunPacket(
  data: RunPacketWithGMData,
): Promise<Blob> {
  // Strip GM-only data
  const exportData: RunPacket = {
    id: data.id,
    name: data.name,
    description: data.description,
    version: VERSION as '1.0',
    hosts: data.hosts.map(host => {
      const sheaf = host.securitySheaf.map(step => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { gmNotes: _gm, ...cleanStep } = step;
        return cleanStep;
      });
      return { ...host, securitySheaf: sheaf };
    }),
    entryHostIds: data.entryHostIds,
    rtg: data.rtg,
    createdAt: data.createdAt,
  };

  const json = JSON.stringify(exportData);
  const encrypted = await encryptData(json);

  const payload = JSON.stringify({
    v: VERSION,
    e: encrypted,
  });

  return new Blob([payload], { type: 'application/json' });
}

/**
 * Trigger a browser file download of the run packet.
 */
export async function downloadRunPacket(
  data: RunPacketWithGMData,
): Promise<void> {
  const blob = await exportRunPacket(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.name.replace(/[^a-z0-9]/gi, '_')}_run${FILE_EXTENSION}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import ───────────────────────────────────────────────────────────────────

/**
 * Load and decrypt a .mxrun file.
 * Throws a user-facing error message if the passphrase is wrong or the file is corrupt.
 */
export async function importRunPacket(file: File): Promise<RunPacket> {
  const text = await file.text();

  let wrapper: { v: string; e: string };
  try {
    wrapper = JSON.parse(text) as { v: string; e: string };
  } catch {
    throw new Error('Invalid run packet file — could not parse.');
  }

  if (!wrapper.v || !wrapper.e) {
    throw new Error('Invalid run packet format.');
  }

  let json: string;
  try {
    json = await decryptData(wrapper.e);
  } catch {
    throw new Error('Could not decrypt run packet — file may be corrupt or from an older version.');
  }

  let packet: RunPacket;
  try {
    packet = JSON.parse(json) as RunPacket;
  } catch {
    throw new Error('Run packet data is corrupted.');
  }

  validateRunPacket(packet);
  return packet;
}

function validateRunPacket(packet: RunPacket): void {
  if (!packet.id || !packet.name || !Array.isArray(packet.hosts)) {
    throw new Error('Run packet is missing required fields.');
  }
  if (packet.hosts.length === 0) {
    throw new Error('Run packet contains no hosts.');
  }
}

// ─── Builder persistence (unencrypted local save) ─────────────────────────────

export function saveBuilderDraft(data: RunPacketWithGMData): void {
  localStorage.setItem(`mxrun_draft_${data.id}`, JSON.stringify(data));
}

export function loadBuilderDraft(id: string): RunPacketWithGMData | null {
  const raw = localStorage.getItem(`mxrun_draft_${id}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunPacketWithGMData;
  } catch {
    return null;
  }
}

export function listBuilderDrafts(): Array<{ id: string; name: string; createdAt: number }> {
  const result: Array<{ id: string; name: string; createdAt: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith('mxrun_draft_')) continue;
    try {
      const draft = JSON.parse(localStorage.getItem(key)!) as RunPacketWithGMData;
      result.push({ id: draft.id, name: draft.name, createdAt: draft.createdAt });
    } catch {
      /* skip corrupt entries */
    }
  }
  return result.sort((a, b) => b.createdAt - a.createdAt);
}

export function deleteBuilderDraft(id: string): void {
  localStorage.removeItem(`mxrun_draft_${id}`);
}

// ─── Run packet factory ───────────────────────────────────────────────────────

export function createEmptyRunPacket(): RunPacketWithGMData {
  return {
    id: crypto.randomUUID(),
    name: 'New Run',
    description: '',
    version: '1.0',
    hosts: [],
    entryHostIds: [],
    createdAt: Date.now(),
    gmNotes: '',
    hostGMNotes: {},
  };
}
