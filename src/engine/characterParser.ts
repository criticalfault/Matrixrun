import type { CharacterSheet, DeckStats, Program } from '@/types';

const SOURCE_TAG = 'MatrixRunCG-v1';

// ─── Parse the Character Generator's JSON export ──────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseCharacterJSON(raw: any): CharacterSheet {
  // Validate minimum required fields
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid character file: not a JSON object.');
  }

  const decks = raw.decks as Array<Record<string, unknown>>;
  if (!decks || decks.length === 0) {
    throw new Error('No cyberdeck found on this character. Only deckers can run Matrix hosts.');
  }

  if (!raw.characterTabs?.Decking) {
    // Warn but don't block — GM may have overridden
    console.warn('characterTabs.Decking is false — character is not configured as a decker.');
  }

  const deckRaw = decks[(raw.selectedDeckIndex as number) || 0] ?? decks[0];

  const programs: Program[] = parsePrograms(deckRaw);
  const deck: DeckStats = parseDeck(deckRaw);
  const attributes = parseAttributes(raw);
  const hackingPool = calculateHackingPool(
    attributes.intelligence,
    deck.persona,
    (raw.cyberAttributeBonuses as Record<string, number>)?.Hacking_Pool ?? 0,
  );

  const isVerified = verifySource(raw);

  return {
    name: (raw.name as string) || '',
    streetName: (raw.street_name as string) || 'Runner',
    race: (raw.race as string) || 'Human',
    attributes,
    deck,
    programs,
    hackingPool,
    computerSkill: findSkillRating(raw, 'Computer'),
    electronicsSkill: findSkillRating(raw, 'Electronics'),
    isVerified,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseDeck(d: any): DeckStats {
  const programsActive: Program[] = [];
  const programsInStorage: Array<{ Size: number }> =
    (d.ProgramsInStorage as Array<{ Size: number }>) ?? [];

  const totalStorageMp = programsInStorage.reduce((sum, p) => sum + (p.Size ?? 0), 0);
  // Active memory is listed in the deck as a number in Mp; CG stores it differently
  // We'll estimate: deck Persona × 100 Mp as a reasonable approximation if not listed
  const activeMemoryMp = (d.ActiveMemory as number) ?? (parseInt(d.Memory as string) || 500);
  const storageMemoryMp = (d.StorageMemory as number) ?? (parseInt(d.Storage as string) || totalStorageMp);

  return {
    name: (d.Name as string) ?? 'Unknown Deck',
    persona: parseInt(d.Persona as string) || 1,
    bod: parseInt(d.Bod as string) || 0,
    evasion: parseInt(d.Evasion as string) || 0,
    sensors: parseInt(d.Sensors as string) || 0,
    masking: parseInt(d.Masking as string) || 0,
    hardening: parseInt(d.Hardening as string) || 0,
    activeMemoryMp,
    storageMemoryMp,
    ioSpeed: parseInt(d['I/O Speed'] as string) || 300,
    responseIncrease: parseInt(d['Response Increase'] as string) || 0,
  };

  void programsActive;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePrograms(d: any): Program[] {
  const storage: Array<Record<string, unknown>> =
    (d.ProgramsInStorage as Array<Record<string, unknown>>) ?? [];

  return storage.map(p => ({
    name: (p.Name as string) ?? 'Unknown',
    multiplier: (p.Multiplyer as number) ?? 1,
    rating: (p.Rating as number) ?? 1,
    loaded: (p.Loaded as boolean) ?? false,
    sizeMp: (p.Size as number) ?? 0,
  }));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseAttributes(raw: any) {
  const a = raw.attributes as Record<string, number>;
  const cyber = raw.cyberAttributeBonuses as Record<string, number>;

  const reaction = (a.Reaction ?? 0) + (cyber?.Reaction ?? 0);

  return {
    body: a.Body ?? 1,
    quickness: a.Quickness ?? 1,
    strength: a.Strength ?? 1,
    charisma: a.Charisma ?? 1,
    willpower: a.Willpower ?? 1,
    intelligence: a.Intelligence ?? 1,
    reaction,
    essence: a.Essence ?? 6,
  };
}

function calculateHackingPool(intelligence: number, mpcp: number, cyberBonus: number): number {
  return Math.floor((intelligence + mpcp) / 3) + cyberBonus;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findSkillRating(raw: any, skillName: string): number {
  const skills = raw.skills as Array<{ name: string; rating: number }> ?? [];
  return skills.find(s => s.name === skillName)?.rating ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function verifySource(raw: any): boolean {
  if (raw._source !== SOURCE_TAG) return false;
  if (!raw._checksum) return false;

  // Simple checksum: sum of key attribute values + deck persona
  const expected = computeChecksum(raw);
  return raw._checksum === expected;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeChecksum(raw: any): string {
  const a = raw.attributes as Record<string, number>;
  const deck = (raw.decks as Array<Record<string, unknown>>)?.[0];
  const sum =
    (a?.Intelligence ?? 0) +
    (a?.Willpower ?? 0) +
    (a?.Body ?? 0) +
    parseInt((deck?.Persona as string) ?? '0');
  return `MR-${sum}`;
}

/**
 * Generate the source tag + checksum fields the CG should embed.
 * Call this from the CG when exporting a "run-ready" character.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function stampCharacterJSON(raw: any): any {
  return {
    ...raw,
    _source: SOURCE_TAG,
    _checksum: computeChecksum(raw),
  };
}
