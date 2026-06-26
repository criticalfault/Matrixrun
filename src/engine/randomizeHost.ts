import type { Host, SecurityCode, ICType, ICInstance, TriggerStep, ICOption, PersonaAttribute, HostFile, FileDefense, WormSubtype } from '@/types';
import { SECURITY_CODE_MAX_VALUE, TRIGGER_STEP_MODIFIER, IC_DEFINITIONS, KILLER_DAMAGE_BY_CODE } from '@/data/srTables';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ─── Subsystem rating ranges by security code ─────────────────────────────────
// Each entry is [min, max] for a typical subsystem at that code.

const SUBSYSTEM_RANGE: Record<SecurityCode, [number, number]> = {
  Blue:   [2, 4],
  Green:  [4, 7],
  Orange: [6, 9],
  Red:    [8, 12],
  UV:     [10, 15],
};

export function randomizeSubsystems(code: SecurityCode): Host['subsystems'] {
  const [lo, hi] = SUBSYSTEM_RANGE[code];
  return {
    access:  rnd(lo, hi),
    files:   rnd(lo, hi),
    control: rnd(lo, hi),
    slave:   rnd(lo, hi),
    index:   rnd(lo, hi),
  };
}

export function randomizeSecurityValue(code: SecurityCode): number {
  const max = SECURITY_CODE_MAX_VALUE[code];
  // Bias toward middle-range values
  const lo = Math.ceil(max * 0.3);
  const hi = Math.floor(max * 0.9);
  return rnd(Math.max(1, lo), hi);
}

// ─── IC pool by security code ─────────────────────────────────────────────────
// Each code has a weighted pool of IC types it may use, escalating with color.

type WeightedIC = { type: ICType; weight: number };

const IC_POOL: Record<SecurityCode, WeightedIC[]> = {
  Blue: [
    { type: 'Probe',    weight: 4 },
    { type: 'Scout',    weight: 2 },
    { type: 'TarBaby',  weight: 1 },
    { type: 'Trace',    weight: 1 },
  ],
  Green: [
    { type: 'Probe',         weight: 3 },
    { type: 'Scout',         weight: 2 },
    { type: 'Trace',         weight: 2 },
    { type: 'TarPit',        weight: 1 },
    { type: 'Killer',        weight: 1 },
    { type: 'TraceWithTrap', weight: 1 },
    { type: 'Ripper',        weight: 1 },
  ],
  Orange: [
    { type: 'Probe',         weight: 2 },
    { type: 'ProbeWithTrap', weight: 2 },
    { type: 'Scout',         weight: 2 },
    { type: 'ScoutWithTrap', weight: 1 },
    { type: 'Trace',         weight: 2 },
    { type: 'TraceWithTrap', weight: 2 },
    { type: 'TarPit',        weight: 2 },
    { type: 'Killer',        weight: 2 },
    { type: 'Crippler',      weight: 1 },
    { type: 'Ripper',        weight: 2 },
    { type: 'Blaster',       weight: 1 },
  ],
  Red: [
    { type: 'ProbeWithTrap', weight: 2 },
    { type: 'ScoutWithTrap', weight: 2 },
    { type: 'TraceWithTrap', weight: 2 },
    { type: 'Killer',        weight: 2 },
    { type: 'Crippler',      weight: 2 },
    { type: 'Ripper',        weight: 3 },
    { type: 'Blaster',       weight: 3 },
    { type: 'Sparky',        weight: 2 },
    { type: 'Psychotropic',  weight: 1 },
  ],
  UV: [
    { type: 'ProbeWithTrap', weight: 1 },
    { type: 'ScoutWithTrap', weight: 1 },
    { type: 'TraceWithTrap', weight: 1 },
    { type: 'Killer',        weight: 1 },
    { type: 'Crippler',      weight: 2 },
    { type: 'Ripper',        weight: 3 },
    { type: 'Blaster',       weight: 3 },
    { type: 'Sparky',        weight: 2 },
    { type: 'Psychotropic',  weight: 2 },
    { type: 'Lethal',        weight: 2 },
    { type: 'Cerebropathic', weight: 1 },
  ],
};

function weightedPick(pool: WeightedIC[]): ICType {
  const total = pool.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (const entry of pool) {
    r -= entry.weight;
    if (r <= 0) return entry.type;
  }
  return pool[pool.length - 1].type;
}

// ─── IC option probability by security code ───────────────────────────────────

const OPTION_CHANCE: Record<SecurityCode, number> = {
  Blue:   0.05,
  Green:  0.10,
  Orange: 0.20,
  Red:    0.35,
  UV:     0.50,
};

const AVAILABLE_OPTIONS: ICOption[] = ['Shield', 'Armor', 'Trap', 'Cascading', 'Expert'];
const PERSONA_ATTRS: PersonaAttribute[] = ['Bod', 'Evasion', 'Masking', 'Sensors'];

function rollOptions(code: SecurityCode): ICOption[] {
  const chance = OPTION_CHANCE[code];
  return AVAILABLE_OPTIONS.filter(() => Math.random() < chance);
}

const DAMAGE_IC_TYPES = new Set<ICType>(['Killer','Lethal','NonLethal','Blaster','Sparky']);

function rollWormSubtype(): WormSubtype {
  const roll = rnd(1, 6) + rnd(1, 6);
  if (roll <= 3) return 'Crashworm';
  if (roll <= 5) return 'Deathworm';
  if (roll <= 8) return 'Dataworm';
  if (roll <= 10) return 'Tapeworm';
  return 'Ringworm';
}

function makeIC(type: ICType, rating: number, code: SecurityCode): ICInstance {
  const def = IC_DEFINITIONS[type];
  const options = rollOptions(code);
  const targetAttribute =
    (type === 'Crippler' || type === 'Ripper') ? pick(PERSONA_ATTRS) : undefined;
  const damageCode = DAMAGE_IC_TYPES.has(type) ? KILLER_DAMAGE_BY_CODE[code] : undefined;
  const wormSubtype = type === 'Worm' ? rollWormSubtype() : undefined;

  return {
    id: crypto.randomUUID(),
    type,
    category: def.category,
    rating,
    options,
    isConstruct: false,
    status: 'dormant',
    currentRating: rating,
    targetAttribute,
    damageCode,
    wormSubtype,
  };
}

// ─── Trigger step count by security code ─────────────────────────────────────

const STEP_COUNT_RANGE: Record<SecurityCode, [number, number]> = {
  Blue:   [6,  10],
  Green:  [8,  12],
  Orange: [10, 14],
  Red:    [12, 18],
  UV:     [14, 20],
};

// ─── IC rating generation ─────────────────────────────────────────────────────

function icRating(secValue: number, stepIndex: number, totalSteps: number): number {
  const progress = stepIndex / Math.max(totalSteps - 1, 1);
  const base = Math.max(2, secValue - 2 + Math.round(progress * 4));
  const jitter = rnd(-1, 1);
  return Math.max(2, base + jitter);
}

// ─── Main randomizer ──────────────────────────────────────────────────────────

export function randomizeSheaf(host: Host): TriggerStep[] {
  const { securityCode: code, securityValue: sv } = host;
  const [minSteps, maxSteps] = STEP_COUNT_RANGE[code];
  const stepCount = rnd(minSteps, maxSteps);
  const mod = TRIGGER_STEP_MODIFIER[code];
  const pool = IC_POOL[code];

  // Build accumulating tally values
  let tally = 0;
  const tallyValues: number[] = [];
  for (let i = 0; i < stepCount; i++) {
    tally += Math.max(1, rnd(1, 6) - 2) + mod;
    tallyValues.push(tally);
  }

  // Alert placement
  const passiveIdx  = Math.min(2, stepCount - 3);
  const activeIdx   = passiveIdx + rnd(2, 3);
  const shutdownIdx = Math.min(activeIdx + rnd(1, 2), stepCount - 1);

  // Blue/Green: alert steps have no IC; Orange/Red/UV: alert steps also get IC
  const alertOnlyForLowCode = code === 'Blue' || code === 'Green';

  const steps: TriggerStep[] = [];
  for (let i = 0; i < stepCount; i++) {
    let alertChange: TriggerStep['alertChange'];
    if      (i === passiveIdx)  alertChange = 'passive';
    else if (i === activeIdx)   alertChange = 'active';
    else if (i === shutdownIdx) alertChange = 'shutdown';

    const isAlertStep = alertChange !== undefined;
    const skipIC = isAlertStep && alertOnlyForLowCode;

    const ics: ICInstance[] = [];
    if (!skipIC) {
      const icCount = rnd(1, i < 2 ? 1 : 2);
      for (let j = 0; j < icCount; j++) {
        const type = weightedPick(pool);
        ics.push(makeIC(type, icRating(sv, i, stepCount), code));
      }
    }

    steps.push({
      id: crypto.randomUUID(),
      triggerValue: tallyValues[i],
      ic: ics,
      alertChange,
    });
  }

  return steps;
}

// ─── Paydata randomizer ───────────────────────────────────────────────────────

// SR3 Matrix p.84: count roll by security code
function rollPaydataCount(code: SecurityCode): number {
  switch (code) {
    case 'Blue':   return Math.max(0, rnd(1, 6) - 1);          // 1D6-1
    case 'Green':  return Math.max(0, rnd(1, 6) + rnd(1, 6) - 2); // 2D6-2
    case 'Orange': return rnd(1, 6) + rnd(1, 6);               // 2D6
    case 'Red':    return rnd(1, 6) + rnd(1, 6) + 2;           // 2D6+2
    case 'UV':     return rnd(1, 6) + rnd(1, 6) + 4;           // 2D6+4
  }
}

// SR3 Matrix p.84: data size roll by security code
function rollDataSize(code: SecurityCode): number {
  switch (code) {
    case 'Blue':   return (rnd(1, 6) + rnd(1, 6)) * 20; // 2D6×20 Mp
    case 'Green':  return (rnd(1, 6) + rnd(1, 6)) * 15; // 2D6×15 Mp
    case 'Orange': return (rnd(1, 6) + rnd(1, 6)) * 10; // 2D6×10 Mp
    case 'Red':    return (rnd(1, 6) + rnd(1, 6)) * 5;  // 2D6×5 Mp
    case 'UV':     return rnd(1, 6) * 5;                 // 1D6×5 Mp
  }
}

// Nuyen value ranges by security code — GM guideline, not strict book rule
const PAYDATA_VALUE_RANGE: Record<SecurityCode, [number, number, number]> = {
  //                                         [low, high, step]
  Blue:   [100,   1_000,    100],
  Green:  [500,   5_000,    500],
  Orange: [2_000, 15_000,  1_000],
  Red:    [8_000, 50_000,  2_000],
  UV:     [25_000, 200_000, 5_000],
};

function rollPaydataValue(code: SecurityCode): number {
  const [lo, hi, step] = PAYDATA_VALUE_RANGE[code];
  const steps = Math.floor((hi - lo) / step);
  return lo + rnd(0, steps) * step;
}

// Flavor name pools by security code — escalate sensitivity
const PAYDATA_NAMES: Record<SecurityCode, string[]> = {
  // Low-level hosts: small businesses, municipal systems, minor corps
  Blue: [
    'Personal Financial Records',
    'Employee Contact List',
    'Internal Memo Archive',
    'Customer Database Extract',
    'Insurance Claim Files',
    'Inventory Audit Log',
    'HR Scheduling Data',
    'Vendor Contract Summaries',
    'Petty Cash Disbursement Records',
    'Building Maintenance Requests',
    'Security Guard Shift Schedule',
    'Parking Permit Registry',
    'Cafeteria Supply Orders',
    'Visitor Badge Log',
    'Utility Usage Reports',
    'Staff Medical Leave Records',
    'Canteen Supplier Invoices',
    'Office Equipment Lease Agreements',
    'Employee Performance Reviews',
    'Recycling Contract Details',
    'Local SIN Verification Logs',
    'Public Transit Pass Reimbursements',
    'Community Outreach Event Files',
    'Low-Priority Courier Manifests',
    'Internal Newsletter Archive',
    'Temp Agency Billing Records',
    'Break Room Restock Requests',
    'Parking Garage Access Logs',
    'Employee Birthday Registry',
    'Cleaning Services Schedule',
  ],
  // Mid-tier: regional corps, gang networked businesses, city government
  Green: [
    'Corporate Expense Reports',
    'Project Budget Breakdown',
    'Supplier Network Map',
    'Regional Sales Projections',
    'Security Personnel Roster',
    'Shipment Tracking Records',
    'Encrypted Personnel Files',
    'Facility Access Logs',
    'Rival Corp Acquisition Rumors',
    'Extraterritoriality Exemption Filings',
    'SIN Fraud Case Summaries',
    'Lone Star Patrol Route Schedules',
    'Gang Territory Negotiation Transcripts',
    'Fixer Network Contact Index',
    'Political Donation Ledger',
    'Smuggling Route Waypoints',
    'Unlicensed Firearm Resale Log',
    'DocWagon Response Priority Map',
    'Licensed Pharmaceutical Diversion Records',
    'Matrix Node Vulnerability Notes',
    'Internal Audit Suppression Memos',
    'Contractor Background Check Files',
    'Warehouse Inventory with Off-Book Items',
    'Credstick Laundering Transaction Log',
    'Street-Level Informant Payments',
    'Union Busting Strategy Documents',
    'Restricted Drone Flight Permits',
    'Knight Errant Bribery Receipts',
    'Mid-Level Executive Personal Debts',
    'Unofficial Hazmat Disposal Records',
  ],
  // Sensitive: major corps, criminal orgs, shadow ops infrastructure
  Orange: [
    'R&D Prototype Specifications',
    'Black Market Contact List',
    'Executive Travel Itineraries',
    'Classified Personnel Dossiers',
    'Bribery Payment Records',
    'Counter-intelligence Ops Summary',
    'Shadow Acquisition Targets',
    'Secured Financial Transfer Logs',
    'Corporate Spy Identification Files',
    'Illegal Cyberware Shipment Manifests',
    'Aztechnology Ritual Site Coordinates',
    'Unfiled Bug Spirit Sighting Reports',
    'Shadowrunner Team Employment Contracts',
    'Political Candidate Kompromat Archive',
    'Mitsuhama Clean Sweep Authorization',
    'Renraku Arcology Internal Status Reports',
    'Saeder-Krupp Subsidiary Shell Corp Map',
    'Yakuza Family Financial Holdings',
    'Seoulpa Ring Courier Drop Schedules',
    'Bioware Prototype Field Trial Data',
    'Lone Star Internal Affairs Investigation',
    'Trid Piracy Distribution Network Map',
    'Ares Arms Prototype Serial Numbers',
    'Toxic Shaman Contact Leads',
    'Restricted Telesma Shipment Routes',
    'Corporate Espionage Op After-Action Reports',
    'Illegal Simsense Recording Catalog',
    'Executive Blackmail Dossiers (Mid-Tier)',
    'Wuxing Triad Financial Interface Records',
    'Off-Book Employee Termination Orders',
  ],
  // High value: megacorp black ops, military, organized crime leadership
  Red: [
    'Megacorp Merger Documents',
    'Weapon System Schematics',
    'Undercover Agent Identities',
    'Bioweapon Research Summary',
    'Political Blackmail Files',
    'Secret Facility Blueprints',
    'Corporate Hit List',
    'Matrix Exploit Source Code',
    'Dragon Hoard Asset Inventory (Partial)',
    'UCAS Black Budget Allocations',
    'CFD Carrier Research Data',
    'Prototype Milspec Cyberware Specs',
    'Lone Star Undercover Officer Registry',
    'Knight Errant Tactical Response Plans',
    'Renraku AI Project Codenames',
    'Corporate Court Sealed Ruling Transcripts',
    'Ares Firewatch Deployment Orders',
    'Evo Metahuman Experimental Subject List',
    'Saeder-Krupp Board Voting Proxies',
    'NSGI Source Code Repository Access Keys',
    'Aztechnology Blood Magic Research Notes',
    'Shiawase Nuclear Facility Schematics',
    'Tempo Drug Supply Chain Mapping',
    'Military Drone Swarm Control Protocols',
    'Corporate Strike Team Deniable Op Files',
    'Universal Brotherhood Remnant Cell List',
    'Transys Neuronet Pre-Crash Data Cache',
    'NeoNET Successor Corp Asset Map',
    'Deep Cover Operative Extraction Costs',
    'Anti-Terrorism Unit Internal Informant List',
  ],
  // Ultraviolet: megacorp secrets, government conspiracies, dragon interests
  UV: [
    'AI Research Core Dataset',
    'Black Project Budget Ledger',
    'Top-tier Shadowrunner Dossiers',
    'Government Black Op Orders',
    'Megacorp Board Voting Records',
    'Classified Metahuman Research',
    'UCAS Military Tech Specs',
    'Corporate Assassination Authorization',
    'Fuchi Secrets Pre-Crash Research Archive',
    'Crash 2.0 Responsibility Attribution Files',
    'Great Dragon Political Influence Map',
    'Lofwyr Personal Communication Intercepts',
    'Dunkelzahn Will Contested Clause Backup',
    'Ares Project: Excalibur Full Specification',
    'CFD Origination Point Analysis',
    'Resonance Realm Cartography Data',
    'AI Emergence Event Classified Timeline',
    'UCAS/CAS Reunification Secret Accord',
    'Corporate Court Black File — Saeder-Krupp',
    'Immortal Elf Identity Verification Records',
    'Technomancer Training Facility Locations',
    'Deep Resonance Convergence Ritual Notes',
    'Universal Matrix Exploit — Zero-Day',
    'Aztlan Spy Network Global Coverage Map',
    'Bug City Containment Failure Internal Report',
    'Megacorp CEO Wetwork Authorization Chain',
    'Prototype Prototype: MCHI Neural Interface',
    'Crypto-Key to Offshore Corporate Blackfund',
    'Sixth World Political Succession War-Game',
    'Awakened Megafauna Behavioral Research',
  ],
};

// Defense probabilities escalate with security code
const PAYDATA_DEFENSE_TABLE: Record<SecurityCode, Array<{ defense: FileDefense; weight: number }>> = {
  Blue: [
    { defense: 'none',              weight: 7 },
    { defense: 'encrypted',         weight: 3 },
  ],
  Green: [
    { defense: 'none',              weight: 4 },
    { defense: 'encrypted',         weight: 5 },
    { defense: 'dataBomb',          weight: 1 },
  ],
  Orange: [
    { defense: 'none',              weight: 2 },
    { defense: 'encrypted',         weight: 4 },
    { defense: 'dataBomb',          weight: 3 },
    { defense: 'encryptedAndBomb',  weight: 1 },
  ],
  Red: [
    { defense: 'encrypted',         weight: 3 },
    { defense: 'dataBomb',          weight: 3 },
    { defense: 'encryptedAndBomb',  weight: 4 },
  ],
  UV: [
    { defense: 'dataBomb',          weight: 2 },
    { defense: 'encryptedAndBomb',  weight: 5 },
    { defense: 'worms',             weight: 3 },
  ],
};

function rollPaydataDefense(code: SecurityCode): { defense: FileDefense; bombRating?: number; wormRating?: number } {
  const table = PAYDATA_DEFENSE_TABLE[code];
  const total = table.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  let defense: FileDefense = 'none';
  for (const entry of table) {
    r -= entry.weight;
    if (r <= 0) { defense = entry.defense; break; }
  }
  const bombRating = (defense === 'dataBomb' || defense === 'encryptedAndBomb')
    ? rnd(Math.max(2, Math.floor(SECURITY_CODE_MAX_VALUE[code] * 0.4)),
          Math.floor(SECURITY_CODE_MAX_VALUE[code] * 0.8))
    : undefined;
  const wormRating = defense === 'worms'
    ? rnd(2, Math.floor(SECURITY_CODE_MAX_VALUE[code] * 0.6))
    : undefined;
  return { defense, bombRating, wormRating };
}

export function randomizePaydata(code: SecurityCode): HostFile[] {
  const count = rollPaydataCount(code);
  const usedNames = new Set<string>();
  const namePool = [...PAYDATA_NAMES[code]];

  return Array.from({ length: count }, (): HostFile => {
    // Pick a unique name from the pool; if exhausted, add a numeric suffix
    let name = pick(namePool.filter(n => !usedNames.has(n)) || namePool);
    if (usedNames.has(name)) name = `${name} (${usedNames.size + 1})`;
    usedNames.add(name);

    const { defense, bombRating, wormRating } = rollPaydataDefense(code);

    return {
      id: crypto.randomUUID(),
      name,
      description: '',
      sizeMp: rollDataSize(code),
      defense,
      bombRating,
      wormRating,
      isPaydata: true,
      paydataValue: rollPaydataValue(code),
    };
  });
}

// ─── Difficulty-based randomizer ─────────────────────────────────────────────

function roll1D3(): number { return Math.ceil(Math.random() * 3); }
function roll2D3(): number { return roll1D3() + roll1D3(); }

export function randomizeByDifficulty(
  _host: Host,
  difficulty: 'Easy' | 'Average' | 'Hard',
): Partial<Host> {
  let sv: number;
  let subRoll: () => number;
  if (difficulty === 'Easy') {
    sv = roll1D3() + 3;
    subRoll = () => roll1D3() + 7;
  } else if (difficulty === 'Average') {
    sv = roll1D3() + 6;
    subRoll = () => roll2D3() + 9;
  } else {
    sv = roll2D3() + 6;
    subRoll = () => Math.ceil(Math.random() * 6) + 12;
  }
  const subsystems: Host['subsystems'] = {
    access:  subRoll(),
    files:   subRoll(),
    slave:   subRoll(),
    index:   subRoll(),
    control: subRoll(),
  };
  return { intrusionDifficulty: difficulty, securityValue: sv, subsystems };
}

/**
 * Returns a full randomized patch for a host based on its security code.
 * Caller merges this into the existing host via UPDATE_HOST.
 */
export function randomizeHost(host: Host): Partial<Host> {
  const securityValue = randomizeSecurityValue(host.securityCode);
  const updatedHost = { ...host, securityValue };
  return {
    securityValue,
    subsystems: randomizeSubsystems(host.securityCode),
    securitySheaf: randomizeSheaf(updatedHost),
    files: [
      ...host.files.filter(f => !f.isPaydata),           // keep hand-crafted non-paydata files
      ...randomizePaydata(host.securityCode),
    ],
  };
}
