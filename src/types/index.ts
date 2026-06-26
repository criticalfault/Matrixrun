// ─── Security & Host Types ────────────────────────────────────────────────────

export type SecurityCode = 'Blue' | 'Green' | 'Orange' | 'Red' | 'UV';

export type AlertLevel = 'none' | 'passive' | 'active' | 'shutdown';

export type ICType =
  // Reactive White
  | 'Probe' | 'Trace' | 'TarBaby'
  // Proactive White
  | 'Killer' | 'Crippler' | 'Scout'
  // Reactive Gray
  | 'TarPit' | 'TraceWithTrap' | 'ProbeWithTrap' | 'ScoutWithTrap'
  // Proactive Gray
  | 'Ripper' | 'Blaster' | 'Sparky'
  // Black
  | 'Psychotropic' | 'Lethal' | 'NonLethal' | 'Cerebropathic'
  // Special
  | 'Construct' | 'DataBomb' | 'Worm' | 'ScramblerIC';

export type ICCategory =
  | 'ReactiveWhite'
  | 'ProactiveWhite'
  | 'ReactiveGray'
  | 'ProactiveGray'
  | 'Black';

export type ICOption =
  | 'Shield'
  | 'Armor'
  | 'Trap'
  | 'Shift'
  | 'Cascading'
  | 'Expert'
  | 'Party';

export type PersonaAttribute = 'Bod' | 'Evasion' | 'Masking' | 'Sensors';

export type ICStatus = 'dormant' | 'active' | 'crashed' | 'suppressed';

export type DamageLevel = 'L' | 'M' | 'S' | 'D';

export type OperationType =
  | 'Access'
  | 'LocateFile'
  | 'ReadFile'
  | 'EditFile'
  | 'LocatePaydata'
  | 'DownloadFile'
  | 'ControlSlave'
  | 'EncryptAccess'
  | 'EncryptFile'
  | 'EncryptSlave'
  | 'AnalyzeHost'
  | 'AnalyzeSubsystem'
  | 'AnalyzeIC'
  | 'CrashIC'
  | 'Attack'
  | 'DumpLog'
  | 'RedirectDatatrail'
  | 'NullOperation';

// ─── IC ───────────────────────────────────────────────────────────────────────

export interface ICInstance {
  id: string;
  type: ICType;
  category: ICCategory;
  rating: number;
  options: ICOption[];
  targetAttribute?: PersonaAttribute; // Crippler / Ripper only
  isConstruct: boolean;
  constructPayload?: ICInstance[];
  // Runtime state (not saved in run packet, only in session)
  status: ICStatus;
  currentRating: number; // can be reduced during combat
  damageCode?: 'L' | 'M' | 'S' | 'D';
  wormSubtype?: WormSubtype;
}

// ─── Host Structure ───────────────────────────────────────────────────────────

export interface TriggerStep {
  id: string;
  triggerValue: number;
  ic: ICInstance[];
  alertChange?: 'passive' | 'active' | 'shutdown';
  gmNotes?: string;
}

export interface SubsystemRatings {
  access: number;
  files: number;
  slave: number;
  index: number;
  control: number;
}

export interface SubsystemOverride {
  id: string;
  subsystem: keyof SubsystemRatings;
  modifier: number;
  description: string; // e.g. "Personnel files +2", "Public area -2"
}

export interface PaydataPoint {
  id: string;
  name: string;
  value: number; // nuyen
  dataSizeMp: number;
  defense: 'none' | 'scramble' | 'dataBomb' | 'worms';
  gmNotes?: string;
}

// ─── Files & Slaves (within a host) ──────────────────────────────────────────

export type FileDefense = 'none' | 'encrypted' | 'dataBomb' | 'worms' | 'encryptedAndBomb';

export interface HostFile {
  id: string;
  name: string;
  description: string;     // what the decker sees when they read it
  sizeMp: number;
  defense: FileDefense;
  bombRating?: number;     // if dataBomb or encryptedAndBomb
  wormRating?: number;
  isPaydata: boolean;
  paydataValue?: number;   // nuyen — overrides table roll if set
  gmNotes?: string;
}

export type SlaveType =
  | 'SecurityCamera'
  | 'DoorLock'
  | 'Turret'
  | 'Alarm'
  | 'EnvironmentalControl'
  | 'VehicleControl'
  | 'PowerSystem'
  | 'Communications'
  | 'Custom';

export interface HostSlave {
  id: string;
  name: string;
  type: SlaveType;
  description: string;       // what the decker sees
  controlEffect: string;     // what happens when the decker takes control
  isEncrypted: boolean;
  encryptionRating?: number;
  hasBomb: boolean;
  bombRating?: number;
  gmNotes?: string;
}

export type TopologyNodeType = 'host' | 'san' | 'one-way-san' | 'vanishing-san' | 'ltg' | 'pltg';

export type VanishingSANVariant = 'timed' | 'teleporting' | 'triggered';
export type WormSubtype = 'Crashworm' | 'Deathworm' | 'Dataworm' | 'Tapeworm' | 'Ringworm';

export interface Host {
  id: string;
  name: string;
  description: string;
  metaphor?: string;
  securityCode: SecurityCode;
  securityValue: number;
  subsystems: SubsystemRatings;
  subsystemVariants: SubsystemOverride[];
  securitySheaf: TriggerStep[];
  shutdownThreshold?: number;
  paydata: PaydataPoint[];
  files: HostFile[];
  slaves: HostSlave[];
  // Branching topology: IDs of hosts/SANs this node links forward to
  nextHostIds: string[];
  // Node type — SANs are lightweight pass-through nodes with no sheaf/subsystems
  nodeType?: TopologyNodeType;
  // Manual position override for drag-to-reposition in topology canvas
  position?: { x: number; y: number };
  // Vanishing SAN variant
  vanishingSANVariant?: VanishingSANVariant;
  // One-way SAN access bonus (1–6 added to access rating)
  oneWaySANAccessBonus?: number;
  // Intrusion difficulty preset
  intrusionDifficulty?: 'Easy' | 'Average' | 'Hard';
  // PLTG group — hosts sharing the same ID carry security tally between them
  pltgGroupId?: string;
  // Placeholder for Phase 6: System Tricks
  specialFeatures: {
    bouncers?: unknown[];
    chokepoints?: unknown[];
    vanishingSANs?: unknown[];
    virtualMachines?: unknown[];
    trapDoors?: unknown[];
    oneWaySANs?: unknown[];
  };
}

// ─── RTG Entry Point ──────────────────────────────────────────────────────────

export interface RTGEntry {
  id: string;
  name: string;
  region: string;
  code: string;              // e.g. "NA/CFS"
  securityCode: SecurityCode;
  securityValue: number;
  subsystems: SubsystemRatings;
}

// ─── Run Packet ───────────────────────────────────────────────────────────────

export interface RunPacket {
  id: string;
  name: string;
  description: string;
  version: '1.0';
  hosts: Host[];
  // Topology entry point
  rtg?: RTGEntry;            // null/undefined = air-gapped, enter directly
  entryHostIds: string[];    // root hosts (connected from RTG or direct entry)
  createdAt: number;
}

// gmNotes are stripped and this wrapper holds them only in the Builder
export interface RunPacketWithGMData extends RunPacket {
  gmNotes: string;
  hostGMNotes: Record<string, string>; // hostId → notes
}

// ─── Character Sheet (from CG JSON) ───────────────────────────────────────────

export interface DeckStats {
  name: string;
  persona: number; // MPCP — drives Hacking Pool and persona ratings
  bod: number;
  evasion: number;
  sensors: number;
  masking: number;
  hardening: number;
  activeMemoryMp: number;
  storageMemoryMp: number;
  ioSpeed: number;
  responseIncrease: number;
}

export interface Program {
  name: string;
  multiplier: number;
  rating: number;
  loaded: boolean;
  sizeMp: number;
}

export interface CharacterSheet {
  name: string;
  streetName: string;
  race: string;
  attributes: {
    body: number;
    quickness: number;
    strength: number;
    charisma: number;
    willpower: number;
    intelligence: number;
    reaction: number;
    essence: number;
  };
  deck: DeckStats;
  programs: Program[];
  hackingPool: number;       // floor((INT + MPCP) / 3) + cyberware bonuses
  computerSkill: number;
  electronicsSkill: number;
  isVerified: boolean;       // source tag + checksum present
}

// ─── Dice & Logging ───────────────────────────────────────────────────────────

export interface DiceRoll {
  dice: number[];
  targetNumber: number;
  successes: number;
  label: string;
  isOpposing?: boolean;
  isCatastrophic?: boolean;
}

export interface TestResult {
  rolls: DiceRoll[];
  netSuccesses: number;
  success: boolean;
  narrative: string;
  tallyChange: number;
  isCatastrophic?: boolean;
}

export type LogEntryType =
  | 'operation'
  | 'ic-activation'
  | 'combat'
  | 'alert'
  | 'system'
  | 'navigation'
  | 'damage';

export interface LogEntry {
  id: string;
  timestamp: number;
  type: LogEntryType;
  title: string;
  details: string;
  rolls?: DiceRoll[];
  tallyChange?: number;
  newTally?: number;
}

// ─── Runner Session State ─────────────────────────────────────────────────────

export interface PersonaCondition {
  bod: number;
  evasion: number;
  sensors: number;
  masking: number;
}

export interface RunnerSession {
  runPacket: RunPacket;
  character: CharacterSheet;
  currentHostId: string;
  securityTally: number;
  alertLevel: AlertLevel;
  // IC currently active and fighting the decker
  activeIC: ICInstance[];
  personaCondition: PersonaCondition;
  stunDamage: number;
  physDamage: number;
  loadedPrograms: Program[];
  // Hacking Pool management
  hackingPoolTotal: number;
  hackingPoolUsed: number;
  // Initiative / turn tracking
  combatTurn: number;
  combatPass: number;
  initiative: number;
  // Discovered paydata (runtime)
  foundPaydata: string[]; // PaydataPoint ids
  log: LogEntry[];
  // Has the decker successfully logged on?
  isLoggedIn: boolean;
  // Is a host shutdown sequence in progress?
  shutdownCountdown?: number;
  // IC that was suppressed (crashed without tally cost)
  suppressedIC: Array<{ id: string; type: ICType; rating: number }>;
}

// ─── Builder UI State ─────────────────────────────────────────────────────────

export interface BuilderState {
  runPacket: RunPacketWithGMData;
  selectedHostId: string | null;
  selectedStepId: string | null;
  isDirty: boolean;
}
