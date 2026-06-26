import type { SecurityCode, ICType, ICCategory, ICOption, PersonaAttribute, AlertLevel, DamageLevel, WormSubtype } from '@/types';

// ─── Security Code Definitions ────────────────────────────────────────────────

export const SECURITY_CODE_COLORS: Record<SecurityCode, string> = {
  Blue:   '#3b82f6',
  Green:  '#22c55e',
  Orange: '#f97316',
  Red:    '#ef4444',
  UV:     '#a855f7',
};

export const SECURITY_CODE_LABEL: Record<SecurityCode, string> = {
  Blue:   'Blue',
  Green:  'Green',
  Orange: 'Orange',
  Red:    'Red',
  UV:     'Ultraviolet',
};

// Max Security Value by code (UV is effectively unlimited but rare)
export const SECURITY_CODE_MAX_VALUE: Record<SecurityCode, number> = {
  Blue:   6,
  Green:  8,
  Orange: 10,
  Red:    12,
  UV:     15,
};

// ─── Trigger Step Tables (p.115 Matrix) ──────────────────────────────────────
// Roll 1D6+2, add modifier, add to previous step

export const TRIGGER_STEP_MODIFIER: Record<SecurityCode, number> = {
  Blue:   4, // range 5–7
  Green:  3, // range 4–6
  Orange: 2, // range 3–5
  Red:    1, // range 2–4
  UV:     0, // tightest spacing
};

// Pre-built example grid sheaves from the book (p.114)
export const SAMPLE_SHEAVES: Record<Exclude<SecurityCode, 'UV'>, Array<{ trigger: number; event: string }>> = {
  Blue: [
    { trigger: 6,  event: 'Probe-5' },
    { trigger: 12, event: 'Probe-6' },
    { trigger: 18, event: 'Scout-6' },
    { trigger: 24, event: 'Passive Alert + Security Deckers' },
    { trigger: 30, event: 'Tar Pit-5' },
    { trigger: 36, event: 'Ripper (mark-rip)-6' },
    { trigger: 42, event: 'Construct-8 (Killer-10, Probe-6)' },
    { trigger: 48, event: 'Active Alert' },
    { trigger: 54, event: 'Blaster-8' },
    { trigger: 60, event: 'Blaster-10' },
  ],
  Green: [
    { trigger: 5,  event: 'Probe-6' },
    { trigger: 10, event: 'Probe-8' },
    { trigger: 15, event: 'Scout-7' },
    { trigger: 20, event: 'Trace-7' },
    { trigger: 25, event: 'Passive Alert + Security Deckers' },
    { trigger: 30, event: 'Ripper (bind-rip)-7' },
    { trigger: 35, event: 'Trace-7 with trap' },
    { trigger: 40, event: 'Blaster-4' },
    { trigger: 45, event: 'Blaster-7' },
    { trigger: 50, event: 'Active Alert' },
    { trigger: 55, event: 'Construct-10 (Blaster-10, Trace-5, Crippler-5)' },
    { trigger: 60, event: 'Sparky-11' },
  ],
  Orange: [
    { trigger: 4,  event: 'Probe-8' },
    { trigger: 8,  event: 'Scout-8' },
    { trigger: 12, event: 'Trace-8' },
    { trigger: 16, event: 'Probe-8 with trap' },
    { trigger: 20, event: 'Tar Pit-6' },
    { trigger: 24, event: 'Passive Alert + Security Deckers + Ripper (mark-rip)-8' },
    { trigger: 28, event: 'Scout-8 with trap' },
    { trigger: 32, event: 'Blaster-8' },
    { trigger: 36, event: 'Trace-12' },
    { trigger: 40, event: 'Construct-12 (Probe-4, Blaster-10, Ripper (bod-rip)-10)' },
    { trigger: 44, event: 'Active Alert + Scout-10 with trap' },
    { trigger: 48, event: 'Psychotropic Black IC-8' },
  ],
  Red: [
    { trigger: 3,  event: 'Probe-10' },
    { trigger: 6,  event: 'Scout-10 with trap' },
    { trigger: 9,  event: 'Crippler (marker)-8' },
    { trigger: 12, event: 'Trace-10 with trap' },
    { trigger: 15, event: 'Killer-8' },
    { trigger: 18, event: 'Passive Alert + Security Deckers + Ripper (mark-rip)-10' },
    { trigger: 21, event: 'Construct-14 (Killer-10, Ripper (bind-rip)-8, Scout-10)' },
    { trigger: 24, event: 'Trace-15' },
    { trigger: 27, event: 'Sparky-10' },
    { trigger: 30, event: 'Active Alert + Psychotropic Black IC-8' },
  ],
};

// ─── IC Definitions ───────────────────────────────────────────────────────────

export interface ICDefinition {
  type: ICType;
  category: ICCategory;
  label: string;
  description: string;
  effect: string;
  targetAttribute?: PersonaAttribute;
  isConstruct?: boolean;
}

export const IC_DEFINITIONS: Record<ICType, ICDefinition> = {
  // Reactive White
  Probe: {
    type: 'Probe', category: 'ReactiveWhite', label: 'Probe',
    description: 'Standard detection IC',
    effect: 'Raises Security Tally when decker is detected. Makes a Security Test each Combat Turn.',
  },
  Trace: {
    type: 'Trace', category: 'ReactiveWhite', label: 'Trace',
    description: 'Attempts to locate the decker\'s jackpoint',
    effect: 'Attack Test vs Evasion. On success, jackpoint is located — Trace modifier applied to future trace attempts.',
  },
  TarBaby: {
    type: 'TarBaby', category: 'ReactiveWhite', label: 'Tar Baby',
    description: 'Slows the decker\'s actions',
    effect: 'On hit, reduce decker\'s Matrix Reaction by IC rating ÷ 2 (round down) for duration.',
  },
  // Proactive White
  Killer: {
    type: 'Killer', category: 'ProactiveWhite', label: 'Killer',
    description: 'Attacks all persona attributes',
    effect: 'Standard cybercombat attack. Reduces all four persona attributes on damage.',
  },
  Crippler: {
    type: 'Crippler', category: 'ProactiveWhite', label: 'Crippler',
    description: 'Targets a specific persona attribute',
    effect: 'Attacks a single persona attribute. Attribute targeted chosen at creation.',
  },
  Scout: {
    type: 'Scout', category: 'ProactiveWhite', label: 'Scout',
    description: 'Tracks and assists other IC',
    effect: 'Probing attacks add dice to the next IC\'s Attack Test (up to Scout rating).',
  },
  // Reactive Gray
  TarPit: {
    type: 'TarPit', category: 'ReactiveGray', label: 'Tar Pit',
    description: 'Traps the decker in place',
    effect: 'On hit, decker cannot move to a new subsystem or jack out without a Willpower (IC Rating) Test.',
  },
  TraceWithTrap: {
    type: 'TraceWithTrap', category: 'ReactiveGray', label: 'Trace (Trap)',
    description: 'Trace IC with a hidden trap program',
    effect: 'Trace IC with a secondary Trap program that triggers if the decker attempts to counter-trace.',
  },
  ProbeWithTrap: {
    type: 'ProbeWithTrap', category: 'ReactiveGray', label: 'Probe (Trap)',
    description: 'Probe IC with a hidden trap program',
    effect: 'Probe IC with a secondary Trap program.',
  },
  ScoutWithTrap: {
    type: 'ScoutWithTrap', category: 'ReactiveGray', label: 'Scout (Trap)',
    description: 'Scout IC with a hidden trap program',
    effect: 'Scout IC with a secondary Trap program.',
  },
  // Proactive Gray
  Ripper: {
    type: 'Ripper', category: 'ProactiveGray', label: 'Ripper',
    description: 'Strips a specific persona attribute to zero',
    effect: 'Attacks one persona attribute. If reduced to 0, decker is dumped. For otaku this causes attribute damage.',
  },
  Blaster: {
    type: 'Blaster', category: 'ProactiveGray', label: 'Blaster',
    description: 'Heavy damage to all persona attributes',
    effect: 'Inflicts heavy damage across all persona attributes. More damaging than Killer.',
  },
  Sparky: {
    type: 'Sparky', category: 'ProactiveGray', label: 'Sparky',
    description: 'Delivers feedback through the ASIST link',
    effect: 'Deals Stun damage to the decker\'s physical body (resisted by Willpower vs IC Rating).',
  },
  // Black IC
  Psychotropic: {
    type: 'Psychotropic', category: 'Black', label: 'Psychotropic Black IC',
    description: 'Induces psychological conditioning',
    effect: 'Non-lethal damage + Willpower test or suffer conditioning effects (Cyberphobia, Frenzy, Judas, Positive Conditioning).',
  },
  Lethal: {
    type: 'Lethal', category: 'Black', label: 'Lethal Black IC',
    description: 'Attempts to kill the decker via biofeedback',
    effect: 'Inflicts Physical damage to the decker\'s body. Resisted by Body (IC Rating).',
  },
  NonLethal: {
    type: 'NonLethal', category: 'Black', label: 'Non-Lethal Black IC',
    description: 'Inflicts Stun damage via biofeedback',
    effect: 'Inflicts Stun damage to the decker\'s body. Resisted by Body (IC Rating).',
  },
  Cerebropathic: {
    type: 'Cerebropathic', category: 'Black', label: 'Cerebropathic Black IC',
    description: 'Destroys higher brain functions',
    effect: 'On dump, decker must resist (IC Rating)D Mental damage or be reduced to vegetative state.',
  },
  // Special
  Construct: {
    type: 'Construct', category: 'ProactiveGray', label: 'IC Construct',
    description: 'A frame core hosting multiple IC programs',
    effect: 'Acts as a single entity; must be defeated as a whole. Payload IC programs act simultaneously.',
    isConstruct: true,
  },
  DataBomb: {
    type: 'DataBomb', category: 'ReactiveWhite', label: 'Data Bomb',
    description: 'Booby-trap attached to a file',
    effect: 'Triggers on file access. Deals damage to persona attributes.',
  },
  Worm: {
    type: 'Worm', category: 'ReactiveWhite', label: 'Worm',
    description: 'Virus program targeting the cyberterminal',
    effect: 'Infects MPCP on contact. Makes Computer (Worm Rating) tests to spread and damage programs.',
  },
  ScramblerIC: {
    type: 'ScramblerIC', category: 'ReactiveWhite', label: 'Scramble IC',
    description: 'Encrypted barrier requiring decryption',
    effect: 'Blocks access to a SAN or subsystem until a Decrypt Access operation succeeds.',
  },
};

// Category labels for UI grouping
export const IC_CATEGORY_LABEL: Record<ICCategory, string> = {
  ReactiveWhite:  'Reactive White',
  ProactiveWhite: 'Proactive White',
  ReactiveGray:   'Reactive Gray',
  ProactiveGray:  'Proactive Gray',
  Black:          'Black',
};

export const IC_CATEGORY_COLOR: Record<ICCategory, string> = {
  ReactiveWhite:  '#94a3b8',
  ProactiveWhite: '#60a5fa',
  ReactiveGray:   '#9ca3af',
  ProactiveGray:  '#f97316',
  Black:          '#ef4444',
};

// ─── IC Options Definitions ───────────────────────────────────────────────────

export const IC_OPTION_DESCRIPTIONS: Record<ICOption, string> = {
  Shield:    'Reduces damage taken by 1 per hit on Damage Resistance Tests.',
  Armor:     'Reduces net successes of attacker by armor rating on Damage Resistance Tests.',
  Trap:      'Secondary program that triggers when decker attacks this IC.',
  Shift:     'When crashed, IC shifts to a new form — changes type and resets.',
  Cascading: 'Each missed attack increases Attack Test dice pool by 1 (up to code maximum).',
  Expert:    'Adds dice to Attack Tests but removes same number from Damage Resistance Tests.',
  Party:     'Multiple IC programs acting as a cluster — harder to hit but attacks suffer modifier.',
};

// ─── Security Tally Cost Table (SR3 p.210) ────────────────────────────────────
// Each operation has a Security Tally cost on failure (and sometimes on success)

export interface OperationDefinition {
  label: string;
  subsystem: 'access' | 'files' | 'slave' | 'index' | 'control' | 'none';
  tallyOnSuccess: number;
  tallyOnFailure: number;
  requiresProgram?: string;
  description: string;
}

export const OPERATION_DEFINITIONS: Record<string, OperationDefinition> = {
  Access: {
    label: 'Logon / Access',
    subsystem: 'access',
    tallyOnSuccess: 0,
    tallyOnFailure: 2,
    description: 'Enter the system through the SAN. Uses Access subsystem rating as base TN.',
  },
  LocateFile: {
    label: 'Locate File',
    subsystem: 'index',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description: 'Search the file system for a specific file. Uses Index subsystem rating.',
  },
  ReadFile: {
    label: 'Read File',
    subsystem: 'files',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description: 'Read the contents of a located file. Uses Files subsystem rating.',
  },
  EditFile: {
    label: 'Edit File',
    subsystem: 'files',
    tallyOnSuccess: 1,
    tallyOnFailure: 2,
    description: 'Modify a file. Raises tally even on success.',
  },
  LocatePaydata: {
    label: 'Locate Paydata',
    subsystem: 'index',
    tallyOnSuccess: 1,
    tallyOnFailure: 2,
    requiresProgram: 'Evaluate',
    description: 'Search for high-value paydata files. Requires Evaluate utility.',
  },
  DownloadFile: {
    label: 'Download File',
    subsystem: 'files',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description: 'Transfer a file to deck storage. I/O speed determines transfer time.',
  },
  ControlSlave: {
    label: 'Control Slave',
    subsystem: 'slave',
    tallyOnSuccess: 1,
    tallyOnFailure: 3,
    requiresProgram: 'Remote Control',
    description: 'Take control of a slaved device. Uses Slave subsystem rating.',
  },
  EncryptAccess: {
    label: 'Encrypt Access',
    subsystem: 'access',
    tallyOnSuccess: 0,
    tallyOnFailure: 2,
    description: 'Encrypt an access node to require a passcode.',
  },
  AnalyzeHost: {
    label: 'Analyze Host',
    subsystem: 'control',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    requiresProgram: 'Analyze',
    description: 'Determine the host\'s Security Code, Security Value, and subsystem ratings.',
  },
  AnalyzeSubsystem: {
    label: 'Analyze Subsystem',
    subsystem: 'control',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    requiresProgram: 'Analyze',
    description: 'Determine the rating of a specific subsystem, detect worms.',
  },
  AnalyzeIC: {
    label: 'Analyze IC',
    subsystem: 'control',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    requiresProgram: 'Analyze',
    description: 'Determine the type and rating of an active IC program.',
  },
  CrashIC: {
    label: 'Crash IC',
    subsystem: 'none',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description: 'Destroy an active IC program using an Attack utility.',
  },
  RedirectDatatrail: {
    label: 'Redirect Datatrail',
    subsystem: 'none',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    requiresProgram: 'Sleaze',
    description: 'Obscure the decker\'s datatrail. +1 TN to Trace IC for each success.',
  },
  DumpLog: {
    label: 'Dump Log',
    subsystem: 'control',
    tallyOnSuccess: 0,
    tallyOnFailure: 2,
    description: 'Erase the security log. Reduces Security Tally by net successes × 2.',
  },
};

// ─── Paydata Tables ───────────────────────────────────────────────────────────

export const PAYDATA_POINTS_TABLE: Record<SecurityCode, { roll: string; dataSizeRoll: string }> = {
  Blue:   { roll: '1D6-1', dataSizeRoll: '2D6×20 Mp' },
  Green:  { roll: '2D6-2', dataSizeRoll: '2D6×15 Mp' },
  Orange: { roll: '2D6',   dataSizeRoll: '2D6×10 Mp' },
  Red:    { roll: '2D6+2', dataSizeRoll: '2D6×5 Mp' },
  UV:     { roll: '2D6+4', dataSizeRoll: '1D6×5 Mp' },
};

// ─── Crippler / Ripper Target Table ──────────────────────────────────────────

export const CRIPPLER_RIPPER_TABLE: Array<{ roll: string; attribute: PersonaAttribute }> = [
  { roll: '1–2', attribute: 'Bod' },
  { roll: '3',   attribute: 'Evasion' },
  { roll: '4–5', attribute: 'Masking' },
  { roll: '6',   attribute: 'Sensors' },
];

// ─── Alert Level Subsystem Modifier ──────────────────────────────────────────

export const ALERT_SUBSYSTEM_MODIFIER: Record<AlertLevel, number> = {
  none:     0,
  passive:  2,   // +2 to all subsystem ratings during passive alert
  active:   2,   // maintained during active alert
  shutdown: 2,
};

// ─── Base TN Modifiers by Security Code for intruding icons ──────────────────

export const INTRUSION_BASE_TN: Record<SecurityCode, number> = {
  Blue:   2,
  Green:  3,
  Orange: 4,
  Red:    5,
  UV:     6,
};

// ─── Killer/Black IC Damage Codes ─────────────────────────────────────────────

export const KILLER_DAMAGE_BY_CODE: Record<SecurityCode, DamageLevel> = {
  Blue:   'M',
  Green:  'M',
  Orange: 'S',
  Red:    'S',
  UV:     'D',
};

// ─── Worm Subtypes ────────────────────────────────────────────────────────────

export const WORM_DEFINITIONS: Record<WormSubtype, { label: string; effect: string }> = {
  Crashworm: { label: 'Crashworm', effect: 'Crashes programs in active memory. Computer test each turn.' },
  Deathworm: { label: 'Deathworm', effect: 'Destroys files permanently. Spreads via open connections.' },
  Dataworm:  { label: 'Dataworm',  effect: 'Corrupts data files silently.' },
  Tapeworm:  { label: 'Tapeworm',  effect: 'Copies and transmits data. Passive — does not attack.' },
  Ringworm:  { label: 'Ringworm',  effect: 'Spreads copies to connected hosts, degrading performance.' },
};
