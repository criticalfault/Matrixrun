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

// ─── System Operations (SR3 p.224-229, Matrix3 p.98-102) ─────────────────────

export interface OperationDefinition {
  label: string;
  /** Which host subsystem rating is used as the base TN. 'none' = Security Value. */
  subsystem: 'access' | 'files' | 'slave' | 'index' | 'control' | 'none';
  /** Operational utility that reduces TN by its rating (null = no utility applies). */
  utility: string | null;
  /** Hacking pool action cost. */
  action: 'Free' | 'Simple' | 'Complex';
  /**
   * Interrogation operations require multiple System Tests that accumulate successes.
   * TN is adjusted by how specific/vague the decker's search terms are (fuzzy modifier).
   */
  isInterrogation?: boolean;
  /** Total accumulated successes needed to complete the interrogation. */
  interrogationGoal?: number;
  /** Ongoing action — continues each turn (Download, Upload, Swap Memory). */
  isOngoing?: boolean;
  /** Monitored action — security may detect activity each turn while active. */
  isMonitored?: boolean;
  /** Displayed in UI as informational guidance — actual tally comes from Security Test. */
  tallyOnSuccess: number;
  tallyOnFailure: number;
  description: string;
}

export const OPERATION_DEFINITIONS: Record<string, OperationDefinition> = {

  // ── Logon / Access Operations ─────────────────────────────────────────────

  LogonToHost: {
    label: 'Logon to Host',
    subsystem: 'access',
    utility: 'Deception',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 2,
    description:
      'Enter a host through a SAN. TN = Access rating. Deception utility reduces TN by its rating. ' +
      'Failure triggers immediate Security Alert.',
  },

  LogonToLTG: {
    label: 'Logon to LTG',
    subsystem: 'access',
    utility: 'Deception',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 2,
    description:
      'Enter a Local Telecommunications Grid node. TN = LTG Access rating. ' +
      'Deception utility reduces TN. Used to reach hosts connected behind the LTG.',
  },

  LogonToRTG: {
    label: 'Logon to RTG',
    subsystem: 'access',
    utility: 'Deception',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 2,
    description:
      'Enter a Regional Telecommunications Grid. TN = RTG Access rating. ' +
      'Deception utility reduces TN. Required to reach hosts across regional networks.',
  },

  GracefulLogoff: {
    label: 'Graceful Logoff',
    subsystem: 'access',
    utility: 'Deception',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Exit the system cleanly, erasing evidence of the intrusion. TN = Access rating. ' +
      'Deception utility reduces TN. Net successes reduce security tally (1 tally per success). ' +
      'Failure leaves a datatrail. Cannot be performed under Active Alert.',
  },

  DecryptAccess: {
    label: 'Decrypt Access',
    subsystem: 'access',
    utility: 'Decrypt',
    action: 'Simple',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Defeat Scramble IC protecting a SAN or access node. TN = Access rating. ' +
      'Decrypt utility reduces TN by its rating. Must succeed before the SAN can be entered.',
  },

  // ── Control Operations ────────────────────────────────────────────────────

  AnalyzeHost: {
    label: 'Analyze Host',
    subsystem: 'control',
    utility: 'Analyze',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Determine host parameters. TN = Control rating. Analyze utility reduces TN. ' +
      'Each net success reveals one piece of info (Security Code, SV, subsystem ratings, etc.). ' +
      '7+ net successes reveals all information about the host at once.',
  },

  AnalyzeIC: {
    label: 'Analyze IC',
    subsystem: 'control',
    utility: 'Analyze',
    action: 'Free',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Identify an active IC program. TN = Control rating. Analyze utility reduces TN. ' +
      'Free action — costs no hacking pool dice. ' +
      'Success reveals IC type, rating, and any special options it carries.',
  },

  AnalyzeIcon: {
    label: 'Analyze Icon',
    subsystem: 'control',
    utility: 'Analyze',
    action: 'Free',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Identify any icon in the Matrix (decker, device, program). TN = Control rating, ' +
      'reduced by Sensors rating (minimum TN 2). Analyze utility further reduces TN. ' +
      'Free action. Success reveals the icon type and any detectable attributes.',
  },

  AnalyzeSecurity: {
    label: 'Analyze Security',
    subsystem: 'control',
    utility: 'Analyze',
    action: 'Simple',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Query host security status. TN = Control rating. Analyze utility reduces TN. ' +
      'Returns current Security Code, Security Tally total, and current Alert level. ' +
      'Does not reveal IC or specific defenses.',
  },

  AnalyzeSubsystem: {
    label: 'Analyze Subsystem',
    subsystem: 'control',
    utility: 'Analyze',
    action: 'Simple',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Examine a specific host subsystem (Access, Control, Index, Files, Slave). ' +
      'TN = rating of the targeted subsystem. Analyze utility reduces TN. ' +
      'Success reveals the subsystem rating and detects any Scramble IC or active worm infections.',
  },

  NullOperation: {
    label: 'Null Operation',
    subsystem: 'control',
    utility: 'Deception',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Perform no meaningful action while masking your presence. TN = Security Value + inactivity modifier. ' +
      'Deception utility reduces TN. Inactivity TN modifier: <10 sec +0, <1 min +1, <1 hr +2, <12 hr +4 (+1 per 12 hr after). ' +
      'Failure means your inactivity was detected and tally increases.',
  },

  // ── Index Operations ──────────────────────────────────────────────────────

  LocateAccessNode: {
    label: 'Locate Access Node',
    subsystem: 'index',
    utility: 'Browse',
    action: 'Complex',
    isInterrogation: true,
    interrogationGoal: 5,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Search host index for a specific SAN or access node. TN = Index rating ± fuzzy modifier. ' +
      'Browse utility reduces TN. Interrogation operation: accumulate 5 total successes across multiple tests. ' +
      'Fuzzy TN modifier based on search specificity: very vague +2, vague +1, normal ±0, specific -1, very specific -2.',
  },

  LocateFile: {
    label: 'Locate File',
    subsystem: 'index',
    utility: 'Browse',
    action: 'Complex',
    isInterrogation: true,
    interrogationGoal: 5,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Search host index for a specific data file. TN = Index rating ± fuzzy modifier. ' +
      'Browse utility reduces TN. Interrogation operation: accumulate 5 total successes across multiple tests. ' +
      'Fuzzy TN modifier: very vague +2, vague +1, normal ±0, specific -1, very specific -2.',
  },

  LocateIC: {
    label: 'Locate IC',
    subsystem: 'index',
    utility: 'Analyze',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Search for dormant IC stored in the host index. TN = Index rating. ' +
      'Analyze utility reduces TN. On success, automatically locates all stored IC programs ' +
      'and reveals their type and rating.',
  },

  LocatePaydata: {
    label: 'Locate Paydata',
    subsystem: 'index',
    utility: 'Evaluate',
    action: 'Complex',
    isInterrogation: true,
    interrogationGoal: 5,
    tallyOnSuccess: 1,
    tallyOnFailure: 2,
    description:
      'Search host index for commercially valuable data. TN = Index rating ± fuzzy modifier. ' +
      'Requires Evaluate utility loaded — Evaluate reduces TN by its rating. ' +
      'Interrogation operation: accumulate 5 total successes. Adds to tally even on success (high-risk operation). ' +
      'Evaluate utility degrades: loses 1D6÷2 rating after each run (round down, min 0).',
  },

  LocateSlave: {
    label: 'Locate Slave',
    subsystem: 'index',
    utility: 'Browse',
    action: 'Complex',
    isInterrogation: true,
    interrogationGoal: 3,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Search host index for a slaved device. TN = Index rating ± fuzzy modifier. ' +
      'Browse utility reduces TN. Interrogation operation: accumulate only 3 total successes ' +
      '(easier than locating files). ' +
      'Fuzzy TN modifier: very vague +2, vague +1, normal ±0, specific -1, very specific -2.',
  },

  LocateDecker: {
    label: 'Locate Decker',
    subsystem: 'index',
    utility: 'Scanner',
    action: 'Complex',
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Detect another decker operating in the same host. Two-test operation: ' +
      '(1) System Test — TN = Index rating, Scanner utility reduces TN; ' +
      '(2) Sensor Test — TN = opposing decker\'s Masking, Sensor attribute adds dice. ' +
      'Both tests must succeed. On success, the opposing decker\'s persona is located and visible.',
  },

  // ── Files Operations ──────────────────────────────────────────────────────

  DownloadData: {
    label: 'Download Data',
    subsystem: 'files',
    utility: 'Read/Write',
    action: 'Simple',
    isOngoing: true,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Transfer a file from the host to deck storage. TN = Files rating. ' +
      'Read/Write utility reduces TN. Ongoing action: transfer rate = deck I/O speed (Mp per Combat Turn). ' +
      'Large files require multiple turns. Must Locate File first. ' +
      'Encrypted files must be Decrypted before downloading.',
  },

  UploadData: {
    label: 'Upload Data',
    subsystem: 'files',
    utility: 'Read/Write',
    action: 'Simple',
    isOngoing: true,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Transfer a file from deck storage into the host. TN = Files rating. ' +
      'Read/Write utility reduces TN. Ongoing action: upload rate = deck I/O speed (Mp per Combat Turn). ' +
      'Success places the file in the host\'s file system.',
  },

  EditFile: {
    label: 'Edit File',
    subsystem: 'files',
    utility: 'Read/Write',
    action: 'Simple',
    tallyOnSuccess: 1,
    tallyOnFailure: 2,
    description:
      'Create, modify, or erase a file on the host. TN = Files rating. ' +
      'Read/Write utility reduces TN. Adds to security tally even on success — ' +
      'altering host data is inherently suspicious. ' +
      'Net successes determine quality/completeness of the edit.',
  },

  DecryptFile: {
    label: 'Decrypt File',
    subsystem: 'files',
    utility: 'Decrypt',
    action: 'Simple',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Remove encryption from a protected data file. TN = Files rating. ' +
      'Decrypt utility reduces TN by its rating. Must succeed before a file can be read, ' +
      'edited, or downloaded. Encrypt utility (opposing) may increase effective TN.',
  },

  MakeComcall: {
    label: 'Make Comcall',
    subsystem: 'files',
    utility: 'Commlink',
    action: 'Complex',
    isMonitored: true,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Place a communication call through the Matrix. TN = Files rating. ' +
      'Commlink utility reduces TN. Monitored action: security may detect the call each turn. ' +
      'Success establishes a communication link. The call persists until ended.',
  },

  TapComcall: {
    label: 'Tap Comcall',
    subsystem: 'files',
    utility: 'Commlink',
    action: 'Complex',
    isMonitored: true,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Intercept an active communication. TN = Files rating. ' +
      'Commlink utility reduces TN. Monitored action. Multi-step: must Locate the comcall first, ' +
      'then Tap it. Success grants passive monitoring; speaking requires additional Spoof tests.',
  },

  // ── Slave Operations ──────────────────────────────────────────────────────

  ControlSlave: {
    label: 'Control Slave',
    subsystem: 'slave',
    utility: 'Spoof',
    action: 'Complex',
    isMonitored: true,
    tallyOnSuccess: 1,
    tallyOnFailure: 3,
    description:
      'Issue commands directly to a slaved device. TN = Slave rating. ' +
      'Spoof utility reduces TN by its rating. Monitored action: security tests each turn. ' +
      'Adds to tally even on success — unauthorized device control is a major intrusion. ' +
      'Must Locate Slave first. Decrypt Slave first if the slave link is encrypted.',
  },

  EditSlave: {
    label: 'Edit Slave',
    subsystem: 'slave',
    utility: 'Spoof',
    action: 'Complex',
    isMonitored: true,
    tallyOnSuccess: 1,
    tallyOnFailure: 2,
    description:
      'Modify the programming or configuration data of a slaved device. TN = Slave rating. ' +
      'Spoof utility reduces TN. Monitored action. ' +
      'Alters device behavior, parameters, or stored data. More subtle than Control Slave ' +
      'but still adds to tally on success.',
  },

  MonitorSlave: {
    label: 'Monitor Slave',
    subsystem: 'slave',
    utility: 'Spoof',
    action: 'Simple',
    isMonitored: true,
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Passively observe the status and sensor feeds of a slaved device. TN = Slave rating. ' +
      'Spoof utility reduces TN. Monitored action — host can detect unauthorized passive monitoring. ' +
      'Simpler than Control Slave (Simple action, no success tally). ' +
      'Must Locate Slave first.',
  },

  DecryptSlave: {
    label: 'Decrypt Slave',
    subsystem: 'slave',
    utility: 'Decrypt',
    action: 'Simple',
    tallyOnSuccess: 0,
    tallyOnFailure: 1,
    description:
      'Remove encryption from a protected slave link. TN = Slave rating. ' +
      'Decrypt utility reduces TN by its rating. Must succeed before Control Slave, ' +
      'Edit Slave, or Monitor Slave can be attempted on an encrypted slave.',
  },

  // ── Utility / Housekeeping Operations ─────────────────────────────────────

  SwapMemory: {
    label: 'Swap Memory',
    subsystem: 'none',
    utility: null,
    action: 'Simple',
    isOngoing: true,
    tallyOnSuccess: 0,
    tallyOnFailure: 0,
    description:
      'Load or unload utility programs from active memory. No System Test required — automatic success. ' +
      'Ongoing action: takes one Combat Turn per program. ' +
      'Swapping programs does not trigger a Security Test.',
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

// ─── Program → Operation Bonus Mapping (SR3 p.237-241, Matrix3 p.68-73) ──────
// Each utility reduces TN by its rating for the listed operations.
// Used for reverse-lookup (e.g. "what does my Browse help with?")

export const PROGRAM_OP_BONUS: Record<string, string[]> = {
  'Analyze':   ['AnalyzeHost', 'AnalyzeIC', 'AnalyzeIcon', 'AnalyzeSecurity', 'AnalyzeSubsystem', 'LocateIC'],
  'Browse':    ['LocateAccessNode', 'LocateFile', 'LocateSlave'],
  'Commlink':  ['MakeComcall', 'TapComcall'],
  'Deception': ['LogonToHost', 'LogonToLTG', 'LogonToRTG', 'GracefulLogoff', 'NullOperation'],
  'Decrypt':   ['DecryptAccess', 'DecryptFile', 'DecryptSlave'],
  'Evaluate':  ['LocatePaydata'],
  'Read/Write':['DownloadData', 'EditFile', 'UploadData'],
  'Scanner':   ['LocateDecker'],
  'Spoof':     ['ControlSlave', 'EditSlave', 'MonitorSlave'],
};

// ─── Worm Subtypes ────────────────────────────────────────────────────────────

export const WORM_DEFINITIONS: Record<WormSubtype, { label: string; effect: string }> = {
  Crashworm: { label: 'Crashworm', effect: 'Crashes programs in active memory. Computer test each turn.' },
  Deathworm: { label: 'Deathworm', effect: 'Destroys files permanently. Spreads via open connections.' },
  Dataworm:  { label: 'Dataworm',  effect: 'Corrupts data files silently.' },
  Tapeworm:  { label: 'Tapeworm',  effect: 'Copies and transmits data. Passive — does not attack.' },
  Ringworm:  { label: 'Ringworm',  effect: 'Spreads copies to connected hosts, degrading performance.' },
};
