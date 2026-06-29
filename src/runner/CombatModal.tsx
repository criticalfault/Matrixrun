import { useState, useCallback } from 'react';
import { rollDice } from '@/engine/diceEngine';
import type {
  ICInstance, Program, CharacterSheet, RunnerSession,
  ICType, DiceRoll, SecurityCode, PersonaAttribute,
} from '@/types';
import { WORM_DEFINITIONS } from '@/data/srTables';

// ─── Public result type ───────────────────────────────────────────────────────

export interface CombatResult {
  icDamage: number;
  icCrashed: boolean;
  personaBoxes: number;
  personaDamageLevel: DmgLevel | null;
  bodyStun: number;
  bodyPhys: number;
  attributeDamage: { attribute: string; boxes: number } | null;
  causedDump: boolean;
  icCategory: string;
  evadeTurns: number;
  log: string;
}

const NULL_RESULT_EXTRAS = { attributeDamage: null as null, causedDump: false };

interface CombatModalProps {
  ic: ICInstance;
  attackProgram: Program | null;
  character: CharacterSheet;
  session: RunnerSession;
  hackingPoolAvailable: number;
  suppressionPool: number;
  onClose: () => void;
  onResult: (result: CombatResult) => void;
  // When true: IC initiated the combat (decker used action elsewhere) — skip to IC attack phase
  icInitiated?: boolean;
}

// ─── SR3 damage staging ───────────────────────────────────────────────────────

type DmgLevel = 'L' | 'M' | 'S' | 'D';
const LEVEL_ORDER: DmgLevel[] = ['L', 'M', 'S', 'D'];
const LEVEL_BOXES: Record<DmgLevel, number> = { L: 1, M: 3, S: 6, D: 10 };
const LEVEL_LABEL: Record<DmgLevel, string> = {
  L: 'Light (1 box)', M: 'Moderate (3 boxes)',
  S: 'Serious (6 boxes)', D: 'Deadly (10 boxes)',
};

function baseDamageLevel(ic: ICInstance, code: SecurityCode): DmgLevel {
  // Blaster (Proactive Gray) always starts at Serious — heavier than Killer
  if (ic.type === 'Blaster') return 'S';
  if (ic.damageCode) return ic.damageCode;
  if (code === 'UV' || code === 'Red' || code === 'Orange') return 'S';
  return 'M';
}

function stageDamage(base: DmgLevel, icHits: number, deckerHits: number): DmgLevel {
  const idx = LEVEL_ORDER.indexOf(base);
  if (icHits > deckerHits) return LEVEL_ORDER[Math.min(3, idx + Math.floor((icHits - deckerHits) / 2))];
  return LEVEL_ORDER[Math.max(0, idx - Math.floor((deckerHits - icHits) / 2))];
}

// ─── IC type helpers ──────────────────────────────────────────────────────────

const REACTIVE_IC: ICType[] = [
  'Probe', 'Trace', 'TarBaby', 'TarPit', 'TraceWithTrap', 'ProbeWithTrap', 'ScoutWithTrap',
];
const isReactive = (t: ICType) => REACTIVE_IC.includes(t);

// IC types that deal body damage instead of persona boxes
const isBodyDamage = (t: ICType) =>
  ['Psychotropic', 'NonLethal', 'Cerebropathic', 'Lethal', 'Sparky'].includes(t);
const isLethal = (t: ICType) => ['Lethal', 'Cerebropathic'].includes(t);

// IC types that damage a specific persona attribute (Crippler, Ripper)
const isAttributeTargeting = (t: ICType) => t === 'Crippler' || t === 'Ripper';

// Sparky uses Willpower for DR, not Bod
const isSparky = (t: ICType) => t === 'Sparky';

// ─── IC option helpers ────────────────────────────────────────────────────────

// Armor: IC has an Armor utility — reduces decker's net successes vs IC
function armorBonus(ic: ICInstance): number {
  return ic.options.includes('Armor') ? Math.max(1, Math.floor(ic.currentRating / 3)) : 0;
}
// Shield: IC has a Shield utility — bonus dice added to IC's defense roll
function shieldDice(ic: ICInstance): number {
  return ic.options.includes('Shield') ? Math.max(1, Math.ceil(ic.currentRating / 3)) : 0;
}
// Expert: IC gets +N attack dice but -N defense dice
function expertBonus(ic: ICInstance): number {
  return ic.options.includes('Expert') ? Math.max(1, Math.floor(ic.currentRating / 3)) : 0;
}

// ─── Persona attribute mapping ────────────────────────────────────────────────

const ATTR_LABEL: Record<PersonaAttribute, string> = {
  Bod: 'Bod', Evasion: 'Evasion', Masking: 'Masking', Sensors: 'Sensors',
};
const ATTR_KEY: Record<PersonaAttribute, 'bod' | 'evasion' | 'masking' | 'sensors'> = {
  Bod: 'bod', Evasion: 'evasion', Masking: 'masking', Sensors: 'sensors',
};

function getDeckAttrValue(attr: PersonaAttribute, char: CharacterSheet): number {
  return char.deck[ATTR_KEY[attr]];
}
function getPersonaConditionValue(attr: PersonaAttribute, session: RunnerSession): number {
  return session.personaCondition?.[ATTR_KEY[attr]] ?? 0;
}

// ─── Defense attribute (what the decker uses to resist IC attack) ─────────────

function defenseAttrLabel(ic: ICInstance): string {
  if (ic.type === 'Sparky') return 'Willpower';
  if (ic.category === 'ProactiveGray') return 'Sensors';
  if (ic.category === 'Black') return 'Bod';
  return 'Evasion';
}
function defenseAttrValue(ic: ICInstance, char: CharacterSheet): number {
  if (ic.type === 'Sparky') return char.attributes.willpower;
  if (ic.category === 'ProactiveGray') return char.deck.sensors;
  if (ic.category === 'Black') return char.deck.bod;
  return char.deck.evasion;
}

// ─── Phase types ──────────────────────────────────────────────────────────────

type ManeuverType = 'evade' | 'parry' | 'position';
type Phase =
  | 'choose'
  | 'maneuver_roll'
  | 'position_choice'
  | 'attack'
  | 'ic_turn'       // IC initiated — decker used their action elsewhere
  | 'counterattack'
  | 'evaded'
  | 'catastrophic';

// ─── Main component ───────────────────────────────────────────────────────────

export default function CombatModal({
  ic, attackProgram, character, session,
  hackingPoolAvailable, suppressionPool, onClose, onResult,
  icInitiated = false,
}: CombatModalProps) {
  const host = session.runPacket?.hosts?.find(h => h.id === session.currentHostId);
  const secCode: SecurityCode = host?.securityCode ?? 'Green';
  const deck = character.deck;
  const defLabel = defenseAttrLabel(ic);
  const defVal   = defenseAttrValue(ic, character);

  const armorProg   = session.loadedPrograms.find(p => p.loaded && p.name.toLowerCase() === 'armor');
  const armorRating = armorProg?.rating ?? 0;
  const cloakProg   = session.loadedPrograms.find(p => p.loaded && p.name.toLowerCase() === 'cloak');
  const cloakRating = cloakProg?.rating ?? 0;

  const effectiveEvasion = Math.max(1, deck.evasion - (session.personaCondition?.evasion ?? 0));

  // Pre-computed IC option modifiers
  const icArmorBonus  = armorBonus(ic);   // reduces decker's net successes vs IC
  const icShieldDice  = shieldDice(ic);   // bonus IC defense dice
  const icExpertBonus = expertBonus(ic);  // +N IC attack, -N IC defense

  // ── Phase state ──
  const [phase, setPhase] = useState<Phase>(icInitiated ? 'ic_turn' : 'choose');
  const [maneuverType, setManeuverType] = useState<ManeuverType | null>(null);

  // ── Maneuver roll state ──
  const [maneuverPool, setManeuverPool] = useState(0);
  const [manDeckerRoll, setManDeckerRoll] = useState<DiceRoll | null>(null);
  const [manICRoll, setManICRoll]         = useState<DiceRoll | null>(null);
  const [manNetSuccesses, setManNetSuccesses] = useState(0);

  // ── Maneuver bonuses carried into combat ──
  const [atkTNReduction, setAtkTNReduction]     = useState(0);
  const [atkPowerBonus, setAtkPowerBonus]       = useState(0);
  const [icAtkTNReduction, setICATKTNReduction] = useState(0);
  const [icPowerBonus, setICPowerBonus]         = useState(0);
  const [parryBonus, setParryBonus]             = useState(0);
  const [evadeTurns, setEvadeTurns]             = useState(0);

  // ── Attack phase state ──
  const [offensePool, setOffensePool]   = useState(0);
  const [attackRoll, setAttackRoll]     = useState<DiceRoll | null>(null);
  const [icDefenseRoll, setIcDefenseRoll] = useState<DiceRoll | null>(null);
  const [icNetDamage, setIcNetDamage]   = useState(0);
  const [attackDone, setAttackDone]     = useState(false);
  // Cascading option: track how many times decker has missed
  const [cascadeBonus, setCascadeBonus] = useState(0);

  // ── Counterattack phase state ──
  const [defensePool, setDefensePool]         = useState(0);
  const [icAttackRoll, setIcAttackRoll]       = useState<DiceRoll | null>(null);
  const [deckerDRRoll, setDeckerDRRoll]       = useState<DiceRoll | null>(null);
  const [counterDone, setCounterDone]         = useState(false);
  const [pendingPersonaBoxes, setPendingPersonaBoxes] = useState(0);
  const [pendingBodyStun, setPendingBodyStun]         = useState(0);
  const [pendingBodyPhys, setPendingBodyPhys]         = useState(0);
  const [pendingAttrDamage, setPendingAttrDamage]     = useState<{ attribute: string; boxes: number } | null>(null);
  const [pendingCausedDump, setPendingCausedDump]     = useState(false);
  const [stagedLevel, setStagedLevel] = useState<DmgLevel>('L');
  const [baseLevel, setBaseLevel]     = useState<DmgLevel>('L');

  // ─────────────────────────────────────────────────────────────────────────────
  // Maneuver roll
  // ─────────────────────────────────────────────────────────────────────────────

  function rollManeuver() {
    const deckerDice = effectiveEvasion + maneuverPool;
    const deckerTN   = Math.max(2, (host?.securityValue ?? 6) - cloakRating);
    const icDice     = host?.securityValue ?? 6;
    const icTN       = effectiveEvasion;
    const dRoll = rollDice(deckerDice, deckerTN, `Evasion ${effectiveEvasion}${maneuverPool > 0 ? `+${maneuverPool}` : ''} vs TN ${deckerTN}`);
    const iRoll = rollDice(icDice, icTN, `Host SV ${icDice} vs TN ${icTN}`);
    setManDeckerRoll(dRoll);
    setManICRoll(iRoll);
    setManNetSuccesses(dRoll.successes - iRoll.successes);
  }

  function applyManeuverResult() {
    const net    = manNetSuccesses;
    const absNet = Math.abs(net);
    if (maneuverType === 'evade') {
      if (net > 0) { setEvadeTurns(net); setPhase('evaded'); }
      else setPhase('attack');
    } else if (maneuverType === 'parry') {
      if (net > 0) setParryBonus(net);
      setPhase('attack');
    } else if (maneuverType === 'position') {
      if (net > 0) { setManNetSuccesses(net); setPhase('position_choice'); }
      else if (net < 0) { setICATKTNReduction(absNet); setPhase('attack'); }
      else setPhase('attack');
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Attack phase
  // ─────────────────────────────────────────────────────────────────────────────

  const handleAttackRoll = useCallback(() => {
    if (!attackProgram) return;
    const atkDice = attackProgram.rating + offensePool + atkPowerBonus;
    const atkTN   = Math.max(2, ic.currentRating - atkTNReduction);
    // IC defense: base rating - Expert penalty + Shield bonus
    const defDice = Math.max(1, ic.currentRating - icExpertBonus + icShieldDice);
    const defTN   = attackProgram.rating;

    const atkRoll = rollDice(atkDice, atkTN, `Attack (${attackProgram.name} ${attackProgram.rating})`);
    const defRoll = rollDice(defDice, defTN, `IC defense (${defDice}d${icShieldDice > 0 ? ` +${icShieldDice} Shield` : ''}${icExpertBonus > 0 ? ` -${icExpertBonus} Expert` : ''})`);

    setAttackRoll(atkRoll);
    setIcDefenseRoll(defRoll);

    if (atkRoll.isCatastrophic) { setPhase('catastrophic'); return; }

    // Armor option reduces decker's net successes vs IC
    const rawNet = atkRoll.successes - defRoll.successes;
    const net    = Math.max(0, rawNet - icArmorBonus);

    // Cascading: decker missed → +1 next turn (capped at IC rating)
    if (net === 0 && ic.options.includes('Cascading')) {
      setCascadeBonus(b => Math.min(ic.currentRating, b + 1));
    }

    setIcNetDamage(net);
    setAttackDone(true);
  }, [attackProgram, ic, offensePool, atkTNReduction, atkPowerBonus, icArmorBonus, icShieldDice, icExpertBonus]);

  const handleProceedToCounterattack = useCallback(() => {
    if (isReactive(ic.type)) return;
    const icDiceBase   = Math.max(1, ic.currentRating - icNetDamage);
    // Expert adds attack dice; Cascading adds accumulated dice
    const icAtkDice    = icDiceBase + icExpertBonus + cascadeBonus;
    const icAtkTN      = Math.max(2, defVal - icAtkTNReduction + parryBonus);
    const label        = `${ic.type} attack ${icAtkDice}d vs TN ${icAtkTN}`
      + (icExpertBonus > 0 ? ` (+${icExpertBonus} Expert)` : '')
      + (cascadeBonus  > 0 ? ` (+${cascadeBonus} Cascade)` : '')
      + (parryBonus    > 0 ? ` (+${parryBonus} Parry)` : '')
      + (icAtkTNReduction > 0 ? ` (-${icAtkTNReduction} Position)` : '');
    setIcAttackRoll(rollDice(icAtkDice, icAtkTN, label));
    setPhase('counterattack');
  }, [ic, icNetDamage, defVal, parryBonus, icAtkTNReduction, icExpertBonus, cascadeBonus]);

  // IC-initiated attack: decker used their action elsewhere — IC attacks at full rating, no prior damage
  const handleICTurnRoll = useCallback(() => {
    if (isReactive(ic.type)) {
      // Reactive IC doesn't attack proactively — resolve as no-op
      onResult({ icDamage: 0, icCrashed: false, personaBoxes: 0, personaDamageLevel: null,
        bodyStun: 0, bodyPhys: 0, ...NULL_RESULT_EXTRAS, icCategory: ic.category, evadeTurns: 0,
        log: `${ic.type} IC took its turn — reactive IC, no attack.` });
      return;
    }
    const icAtkDice = Math.max(1, ic.currentRating + icExpertBonus + cascadeBonus);
    const icAtkTN   = Math.max(2, defVal);
    const label     = `${ic.type} takes its turn — ${icAtkDice}d vs TN ${icAtkTN} (${defLabel})`
      + (icExpertBonus > 0 ? ` (+${icExpertBonus} Expert)` : '')
      + (cascadeBonus  > 0 ? ` (+${cascadeBonus} Cascade)` : '');
    setIcAttackRoll(rollDice(icAtkDice, icAtkTN, label));
    setPhase('counterattack');
  }, [ic, defVal, defLabel, icExpertBonus, cascadeBonus, onResult]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Damage resistance
  // ─────────────────────────────────────────────────────────────────────────────

  const handleDRRoll = useCallback(() => {
    if (!icAttackRoll) return;
    const power  = Math.max(1, ic.currentRating - icNetDamage + icPowerBonus);
    const drTN   = Math.max(2, isSparky(ic.type) ? ic.currentRating : power - armorRating);

    // Sparky: Willpower. All others: Bod.
    const drStatDice = isSparky(ic.type) ? character.attributes.willpower : deck.bod;
    const drLabel    = isSparky(ic.type) ? 'Willpower' : `Bod ${deck.bod}`;
    const drDice     = drStatDice + suppressionPool + defensePool;

    const drRoll = rollDice(drDice, drTN,
      `DR (${drLabel}${armorRating > 0 && !isSparky(ic.type) ? `, Armor-${armorRating}` : ''}${suppressionPool > 0 ? `, +${suppressionPool} suppress` : ''})`);
    setDeckerDRRoll(drRoll);

    const base   = baseDamageLevel(ic, secCode);
    const staged = stageDamage(base, icAttackRoll.successes, drRoll.successes);
    const boxes  = LEVEL_BOXES[staged];
    setBaseLevel(base);
    setStagedLevel(staged);

    const tookDamage = icAttackRoll.successes > 0 || drRoll.successes === 0;

    if (!isReactive(ic.type) && tookDamage) {
      if (isAttributeTargeting(ic.type) && ic.targetAttribute) {
        // Crippler / Ripper — damage goes to the targeted persona attribute
        const attr   = ic.targetAttribute as PersonaAttribute;
        const attrMax = getDeckAttrValue(attr, character);
        const dmgSoFar = getPersonaConditionValue(attr, session);
        const remaining = Math.max(0, attrMax - dmgSoFar);
        const actualBoxes = Math.min(boxes, remaining);
        const dumped = ic.type === 'Ripper' && (dmgSoFar + actualBoxes >= attrMax);
        setPendingAttrDamage({ attribute: attr, boxes: actualBoxes });
        setPendingCausedDump(dumped);
        setPendingPersonaBoxes(0);
        setPendingBodyStun(0);
        setPendingBodyPhys(0);
      } else if (isBodyDamage(ic.type)) {
        isLethal(ic.type) ? setPendingBodyPhys(boxes) : setPendingBodyStun(boxes);
        setPendingPersonaBoxes(0);
        setPendingAttrDamage(null);
        setPendingCausedDump(false);
      } else {
        setPendingPersonaBoxes(boxes);
        setPendingBodyStun(0);
        setPendingBodyPhys(0);
        setPendingAttrDamage(null);
        setPendingCausedDump(false);
      }
    } else {
      setPendingPersonaBoxes(0);
      setPendingBodyStun(0);
      setPendingBodyPhys(0);
      setPendingAttrDamage(null);
      setPendingCausedDump(false);
    }
    setCounterDone(true);
  }, [icAttackRoll, defensePool, suppressionPool, deck.bod, ic, icNetDamage, armorRating,
      secCode, icPowerBonus, character, session]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Result builders
  // ─────────────────────────────────────────────────────────────────────────────

  const buildManeuverLogFragment = () => {
    if (!maneuverType || !manDeckerRoll || !manICRoll) return '';
    const label = maneuverType === 'evade' ? 'Evade' : maneuverType === 'parry' ? 'Parry' : 'Position';
    const net   = manNetSuccesses;
    return `${label}: ${manDeckerRoll.successes} vs ${manICRoll.successes} (net ${net > 0 ? '+' : ''}${net}). `;
  };

  const buildOptionsLogFragment = () => {
    const parts: string[] = [];
    if (icArmorBonus  > 0) parts.push(`Armor-${icArmorBonus}`);
    if (icShieldDice  > 0) parts.push(`Shield+${icShieldDice}`);
    if (icExpertBonus > 0) parts.push(`Expert±${icExpertBonus}`);
    if (cascadeBonus  > 0) parts.push(`Cascade+${cascadeBonus}`);
    return parts.length > 0 ? `[IC opts: ${parts.join(', ')}] ` : '';
  };

  const handleApplyAndClose = useCallback(() => {
    if (!attackRoll || !icDefenseRoll) return;
    const newRating = ic.currentRating - icNetDamage;
    const power = Math.max(1, ic.currentRating - icNetDamage + icPowerBonus);
    const drTN  = Math.max(2, isSparky(ic.type) ? ic.currentRating : power - armorRating);

    let log = buildManeuverLogFragment() + buildOptionsLogFragment();
    const dcLabel = attackProgram.damageCode ? ` [${attackProgram.damageCode === 'L' ? 'Light' : attackProgram.damageCode === 'M' ? 'Moderate' : attackProgram.damageCode === 'S' ? 'Serious' : 'Deadly'}]` : '';
    log += `Attack${dcLabel}: ${attackRoll.successes} hits vs IC ${icDefenseRoll.successes} hits`;
    if (icArmorBonus > 0) log += ` (Armor -${icArmorBonus} net)`;
    if (icNetDamage > 0) log += ` — IC -${icNetDamage} rating`;
    if (newRating <= 0) log += ` — IC CRASHED`;
    if (icAttackRoll && deckerDRRoll) {
      const drLabel = isSparky(ic.type) ? `WIL` : `Bod`;
      log += ` | Counter: IC ${icAttackRoll.successes} hits, ${drLabel} DR vs TN${drTN}: ${deckerDRRoll.successes} hits`;
      log += ` — ${baseLevel}→${stagedLevel} = ${LEVEL_BOXES[stagedLevel]} boxes`;
    }
    if (pendingAttrDamage) {
      log += ` — ${ic.type} targets ${pendingAttrDamage.attribute}: -${pendingAttrDamage.boxes} boxes`;
      if (pendingCausedDump) log += ' — DUMP TRIGGERED';
    }

    onResult({
      icDamage: icNetDamage, icCrashed: newRating <= 0,
      personaBoxes: pendingPersonaBoxes, personaDamageLevel: pendingPersonaBoxes > 0 ? stagedLevel : null,
      bodyStun: pendingBodyStun, bodyPhys: pendingBodyPhys,
      attributeDamage: pendingAttrDamage, causedDump: pendingCausedDump,
      icCategory: ic.category, evadeTurns: 0, log,
    });
  }, [attackRoll, icDefenseRoll, icNetDamage, ic, attackProgram, icAttackRoll, deckerDRRoll,
      armorRating, deck.bod, baseLevel, stagedLevel, pendingPersonaBoxes, pendingBodyStun,
      pendingBodyPhys, pendingAttrDamage, pendingCausedDump, onResult, icPowerBonus,
      icArmorBonus, icShieldDice, icExpertBonus, cascadeBonus,
      atkTNReduction, atkPowerBonus, icAtkTNReduction, parryBonus,
      maneuverType, manDeckerRoll, manICRoll, manNetSuccesses]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const headerTitle = phase === 'choose'          ? `CYBERCOMBAT — ${ic.type}-${ic.currentRating}`
    : phase === 'maneuver_roll'                    ? `MANEUVER: ${maneuverType?.toUpperCase()}`
    : phase === 'position_choice'                  ? 'POSITION ATTACK — CHOOSE BONUS'
    : phase === 'attack'                           ? `ATTACK — ${ic.type}-${ic.currentRating}`
    : phase === 'ic_turn'                          ? `IC ATTACKS — ${ic.type}-${ic.currentRating}`
    : phase === 'counterattack'                    ? 'IC COUNTERATTACK — DAMAGE RESISTANCE'
    : phase === 'evaded'                           ? 'EVADE DETECTION — SUCCESS'
    : 'CATASTROPHIC FAILURE';

  // IC option modifiers visible during attack
  const icDefDice = Math.max(1, ic.currentRating - icExpertBonus + icShieldDice);

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <div className="flex flex-col gap-0 border font-mono text-[13px] overflow-y-auto"
        style={{ width: 560, maxHeight: '92vh', borderColor: 'var(--color-primary)',
          backgroundColor: 'var(--color-card)', boxShadow: '0 0 30px var(--color-primary)44' }}>

        <div className="px-4 py-2 border-b text-[14px] font-bold tracking-widest"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
          {headerTitle}
        </div>

        <div className="p-4 flex flex-col gap-3">

          {/* ── IC_TURN phase — decker used their action elsewhere, IC attacks ── */}
          {phase === 'ic_turn' && (
            <>
              <div className="border border-[#ef4444] p-3 text-center" style={{ backgroundColor: '#ef444410' }}>
                <div className="text-[#ef4444] font-bold text-[14px] tracking-widest">IC TAKES ITS TURN</div>
                <div className="text-[var(--color-muted-foreground)] text-[11px] mt-1">
                  Decker used their action on a non-combat operation. {ic.type} now attacks.
                </div>
              </div>
              <div className="border border-[var(--color-border)] p-2 flex flex-col gap-1">
                <InfoRow label="IC" value={`${ic.type} — rating ${ic.currentRating}`} />
                <InfoRow label="IC attack dice" value={`${Math.max(1, ic.currentRating + icExpertBonus)}d vs TN ${Math.max(2, defVal)} (${defLabel})`} />
                {icExpertBonus > 0 && <InfoRow label="Expert" value={`+${icExpertBonus} attack dice`} />}
                {cascadeBonus  > 0 && <InfoRow label="Cascade" value={`+${cascadeBonus} from prior misses`} />}
                <InfoRow label="Decker DR" value={`${isSparky(ic.type) ? `Willpower (${character.attributes.willpower})` : `Bod (${deck.bod})`}${armorRating > 0 && !isSparky(ic.type) ? ` + Armor ${armorRating}` : ''}`} />
              </div>
              {isAttributeTargeting(ic.type) && ic.targetAttribute && (
                <div className="border border-[#f97316] p-2 text-[11px]" style={{ backgroundColor: '#f9703610' }}>
                  <span className="text-[#f97316] font-bold">{ic.type.toUpperCase()}</span>
                  <span className="text-[var(--color-muted-foreground)]"> — targets </span>
                  <span className="font-bold">{ic.targetAttribute}</span>
                  {ic.type === 'Ripper' && <span className="text-[#ef4444]"> — dump if 0</span>}
                </div>
              )}
              {ic.type === 'Blaster' && (
                <div className="border border-[#f97316] p-2 text-[11px]" style={{ backgroundColor: '#f9703610' }}>
                  <span className="text-[#f97316] font-bold">BLASTER</span>
                  <span className="text-[var(--color-muted-foreground)]"> — base damage Serious regardless of host code</span>
                </div>
              )}
              {isSparky(ic.type) && (
                <div className="border border-[#f97316] p-2 text-[11px]" style={{ backgroundColor: '#f9703610' }}>
                  <span className="text-[#f97316] font-bold">SPARKY</span>
                  <span className="text-[var(--color-muted-foreground)]"> — Stun, resisted by Willpower ({character.attributes.willpower}) vs TN = IC rating</span>
                </div>
              )}
              <button
                onClick={handleICTurnRoll}
                className="w-full py-3 border font-bold tracking-widest text-[14px] hover:opacity-80"
                style={{ borderColor: '#ef4444', color: '#ef4444', backgroundColor: '#ef444410' }}>
                ROLL IC ATTACK
              </button>
            </>
          )}

          {/* ── CHOOSE phase ── */}
          {phase === 'choose' && (
            <>
              {/* IC summary */}
              <div className="border border-[var(--color-border)] p-2 flex flex-col gap-1">
                <InfoRow label="IC" value={`${ic.type} — rating ${ic.currentRating}`} />
                <InfoRow label="Category" value={ic.category} />
                <InfoRow label="Decker defends with" value={`${defLabel} (${defVal})`} />
                {attackProgram && <InfoRow label="Attack program" value={`${attackProgram.name} (rating ${attackProgram.rating})`} />}
                {cloakRating > 0 && <InfoRow label="Cloak" value={`${cloakRating} — reduces maneuver TN`} />}
              </div>

              {/* IC type-specific notes */}
              {isAttributeTargeting(ic.type) && ic.targetAttribute && (
                <div className="border border-[#f97316] p-2 text-[11px]" style={{ backgroundColor: '#f9703610' }}>
                  <span className="text-[#f97316] font-bold">{ic.type.toUpperCase()}</span>
                  <span className="text-[var(--color-muted-foreground)]"> — targets </span>
                  <span className="text-[var(--color-foreground)] font-bold">{ic.targetAttribute}</span>
                  {ic.type === 'Ripper' && (
                    <span className="text-[#ef4444]"> — if attribute hits 0, decker is DUMPED</span>
                  )}
                </div>
              )}
              {ic.type === 'Blaster' && (
                <div className="border border-[#f97316] p-2 text-[11px]" style={{ backgroundColor: '#f9703610' }}>
                  <span className="text-[#f97316] font-bold">BLASTER</span>
                  <span className="text-[var(--color-muted-foreground)]"> — base damage starts at </span>
                  <span className="font-bold text-[var(--color-foreground)]">Serious</span>
                  <span className="text-[var(--color-muted-foreground)]"> regardless of host code</span>
                </div>
              )}
              {isSparky(ic.type) && (
                <div className="border border-[#f97316] p-2 text-[11px]" style={{ backgroundColor: '#f9703610' }}>
                  <span className="text-[#f97316] font-bold">SPARKY</span>
                  <span className="text-[var(--color-muted-foreground)]"> — Stun damage resisted by </span>
                  <span className="font-bold text-[var(--color-foreground)]">Willpower ({character.attributes.willpower})</span>
                  <span className="text-[var(--color-muted-foreground)]"> vs TN = IC rating</span>
                </div>
              )}
              {ic.type === 'Worm' && ic.wormSubtype && (
                <div className="border border-[#a855f7] p-2 text-[11px]" style={{ backgroundColor: '#a855f710' }}>
                  <span className="text-[#a855f7] font-bold">{WORM_DEFINITIONS[ic.wormSubtype]?.label ?? ic.wormSubtype}</span>
                  <span className="text-[var(--color-muted-foreground)]"> — {WORM_DEFINITIONS[ic.wormSubtype]?.effect}</span>
                  <div className="mt-1 text-[var(--color-muted-foreground)] italic">
                    Per-turn Computer tests are GM-tracked. You can still attack and crash the Worm.
                  </div>
                </div>
              )}

              {/* IC options */}
              {ic.options.length > 0 && (
                <ICOptionBadges ic={ic} expertBonus={icExpertBonus} shieldDice={icShieldDice} armorBonus={icArmorBonus} />
              )}

              <button onClick={() => setPhase('attack')}
                className="w-full py-2.5 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10 transition-colors"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                ⚔ ATTACK — Engage directly
              </button>

              <div className="border-t border-[var(--color-border)] pt-2 flex flex-col gap-2">
                <div className="text-[11px] text-[var(--color-muted-foreground)] italic">
                  Maneuvers: Evasion {effectiveEvasion}d vs host SV {host?.securityValue ?? '?'} (TN {Math.max(2, (host?.securityValue ?? 6) - cloakRating)})
                </div>
                <ManeuverButton icon="⚡" title="POSITION ATTACK" color="#f59e0b"
                  subtitle="Win: choose reduce attack TN or boost Power. IC win: IC gets the bonus."
                  onClick={() => { setManeuverType('position'); setPhase('maneuver_roll'); }} />
                <ManeuverButton icon="🛡" title="PARRY ATTACK" color="#06b6d4"
                  subtitle="Win: +net successes to IC attack TN this exchange. Safe — IC win gives no benefit."
                  onClick={() => { setManeuverType('parry'); setPhase('maneuver_roll'); }} />
                <ManeuverButton icon="👻" title="EVADE DETECTION" color="#a855f7"
                  subtitle="Win: IC evaded for net-success turns. Tally gained during evasion shortens timer."
                  onClick={() => { setManeuverType('evade'); setPhase('maneuver_roll'); }} />
              </div>
            </>
          )}

          {/* ── MANEUVER ROLL phase ── */}
          {phase === 'maneuver_roll' && (
            <>
              <ManeuverRollInfo maneuverType={maneuverType!}
                deckerEvasion={effectiveEvasion} cloakRating={cloakRating}
                hostSV={host?.securityValue ?? 6} />
              {!manDeckerRoll && (
                <>
                  <PoolSlider label="Hacking pool (to Evasion)" value={maneuverPool}
                    max={hackingPoolAvailable} onChange={setManeuverPool} />
                  <button onClick={rollManeuver}
                    className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                    style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                    [ ROLL MANEUVER ]
                  </button>
                </>
              )}
              {manDeckerRoll && manICRoll && (
                <>
                  <RollResultBlock label={`Decker Evasion ${effectiveEvasion + maneuverPool}d vs TN ${Math.max(2, (host?.securityValue ?? 6) - cloakRating)}`} roll={manDeckerRoll} />
                  <RollResultBlock label={`Host SV ${host?.securityValue ?? 6}d vs TN ${effectiveEvasion}`} roll={manICRoll} />
                  <ManeuverResultBanner maneuverType={maneuverType!} netSuccesses={manNetSuccesses} deckerWon={manNetSuccesses > 0} />
                  <button onClick={applyManeuverResult}
                    className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                    [ APPLY & CONTINUE ]
                  </button>
                </>
              )}
            </>
          )}

          {/* ── POSITION CHOICE phase ── */}
          {phase === 'position_choice' && (
            <>
              <div className="border border-[#f59e0b] p-3 text-center" style={{ backgroundColor: '#f59e0b10' }}>
                <div className="text-[#f59e0b] font-bold text-[14px]">POSITION ATTACK WON</div>
                <div className="text-[var(--color-muted-foreground)] text-[12px] mt-1">
                  Net {manNetSuccesses} success{manNetSuccesses !== 1 ? 'es' : ''}. Choose your bonus:
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setAtkTNReduction(manNetSuccesses); setPhase('attack'); }}
                  className="border p-3 text-center hover:opacity-80" style={{ borderColor: '#22c55e', color: '#22c55e' }}>
                  <div className="font-bold text-[15px]">-{manNetSuccesses} TN</div>
                  <div className="text-[11px] mt-1 text-[var(--color-muted-foreground)]">Reduce attack TN<br />easier to hit</div>
                </button>
                <button onClick={() => { setAtkPowerBonus(manNetSuccesses); setPhase('attack'); }}
                  className="border p-3 text-center hover:opacity-80" style={{ borderColor: '#f59e0b', color: '#f59e0b' }}>
                  <div className="font-bold text-[15px]">+{manNetSuccesses} Power</div>
                  <div className="text-[11px] mt-1 text-[var(--color-muted-foreground)]">More attack dice<br />harder IC defense</div>
                </button>
              </div>
            </>
          )}

          {/* ── ATTACK phase ── */}
          {phase === 'attack' && (
            <>
              {atkTNReduction  > 0 && <BonusBanner color="#22c55e" label={`POSITION: TN -${atkTNReduction}`} />}
              {atkPowerBonus   > 0 && <BonusBanner color="#f59e0b" label={`POSITION: +${atkPowerBonus} attack dice`} />}
              {parryBonus      > 0 && <BonusBanner color="#06b6d4" label={`PARRY ACTIVE: IC attack TN +${parryBonus}`} />}
              {icAtkTNReduction > 0 && <BonusBanner color="#ef4444" label={`IC POSITION: IC attack TN -${icAtkTNReduction}`} />}
              {cascadeBonus    > 0 && <BonusBanner color="#f97316" label={`CASCADE: IC attack +${cascadeBonus} dice (${cascadeBonus} missed attack${cascadeBonus !== 1 ? 's' : ''})`} />}

              <div className="border border-[var(--color-border)] p-2 flex flex-col gap-1">
                <InfoRow label="Attack program"
                  value={`${attackProgram.name} ${attackProgram.rating}${attackProgram.damageCode ? ` — ${attackProgram.damageCode === 'L' ? 'Light' : attackProgram.damageCode === 'M' ? 'Moderate' : attackProgram.damageCode === 'S' ? 'Serious' : 'Deadly'}` : ''}`} />
                <InfoRow label="Attack dice"
                  value={`${attackProgram.rating}${offensePool > 0 ? `+${offensePool}pool` : ''}${atkPowerBonus > 0 ? `+${atkPowerBonus}pos` : ''} = ${attackProgram.rating + offensePool + atkPowerBonus}`} />
                <InfoRow label="Attack TN (IC rating)"
                  value={atkTNReduction > 0
                    ? `${ic.currentRating} -${atkTNReduction} = ${Math.max(2, ic.currentRating - atkTNReduction)}`
                    : String(ic.currentRating)}
                  highlight />
                <InfoRow label="IC defends with"
                  value={`${icDefDice}d, TN ${attackProgram.rating}`
                    + (icShieldDice  > 0 ? ` (+${icShieldDice} Shield)` : '')
                    + (icExpertBonus > 0 ? ` (-${icExpertBonus} Expert)` : '')} />
                {icArmorBonus > 0 && (
                  <InfoRow label="IC Armor option" value={`-${icArmorBonus} to decker's net successes`} />
                )}
              </div>

              {!attackDone && (
                <PoolSlider label="Offense hacking pool" value={offensePool}
                  max={hackingPoolAvailable} onChange={setOffensePool} />
              )}
              {!attackDone && (
                <button onClick={handleAttackRoll}
                  className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                  [ ROLL ATTACK ]
                </button>
              )}

              {attackDone && attackRoll && icDefenseRoll && (
                <>
                  <RollResultBlock label={`Decker attack — TN ${Math.max(2, ic.currentRating - atkTNReduction)}`} roll={attackRoll} />
                  <RollResultBlock label={`IC defense (${icDefDice}d) — TN ${attackProgram.rating}`} roll={icDefenseRoll} />
                  <div className="border p-2 text-center" style={{ borderColor: icNetDamage > 0 ? 'var(--color-primary)' : 'var(--color-border)' }}>
                    {icArmorBonus > 0 && attackRoll.successes - icDefenseRoll.successes > 0 && icNetDamage < attackRoll.successes - icDefenseRoll.successes && (
                      <div className="text-[11px] text-[#f97316] mb-1">
                        Raw net {attackRoll.successes - icDefenseRoll.successes} − Armor {icArmorBonus} = {icNetDamage}
                      </div>
                    )}
                    {icNetDamage > 0
                      ? <span style={{ color: 'var(--color-primary)' }}>
                          NET {icNetDamage} — IC rating {ic.currentRating} → {ic.currentRating - icNetDamage}
                          {ic.currentRating - icNetDamage <= 0 ? ' — IC CRASHED' : ''}
                        </span>
                      : <span style={{ color: 'var(--color-muted-foreground)' }}>
                          No net successes — IC holds
                          {ic.options.includes('Cascading') ? ' (Cascade +1 next attack)' : ''}
                        </span>}
                  </div>

                  {isReactive(ic.type)
                    ? <button
                        onClick={() => onResult({
                          icDamage: icNetDamage, icCrashed: ic.currentRating - icNetDamage <= 0,
                          personaBoxes: 0, personaDamageLevel: null, bodyStun: 0, bodyPhys: 0,
                          ...NULL_RESULT_EXTRAS, icCategory: ic.category, evadeTurns: 0,
                          log: `${buildManeuverLogFragment()}${buildOptionsLogFragment()}Attack${attackProgram.damageCode ? ` [${attackProgram.damageCode === 'L' ? 'Light' : attackProgram.damageCode === 'M' ? 'Moderate' : attackProgram.damageCode === 'S' ? 'Serious' : 'Deadly'}]` : ''}: ${attackRoll.successes} vs IC ${icDefenseRoll.successes} — net ${icNetDamage}. Reactive IC: no counterattack.`,
                        })}
                        className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10"
                        style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                        [ APPLY & CLOSE (Reactive IC) ]
                      </button>
                    : <button onClick={handleProceedToCounterattack}
                        className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10"
                        style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                        [ CONTINUE → IC STRIKES BACK ]
                      </button>}
                </>
              )}
            </>
          )}

          {/* ── COUNTERATTACK phase ── */}
          {phase === 'counterattack' && icAttackRoll && (() => {
            const power    = Math.max(1, ic.currentRating - icNetDamage + icPowerBonus);
            const drTN     = Math.max(2, isSparky(ic.type) ? ic.currentRating : power - armorRating);
            const base     = baseDamageLevel(ic, secCode);
            const icAtkTN  = Math.max(2, defVal - icAtkTNReduction + parryBonus);
            const drStatDice = isSparky(ic.type) ? character.attributes.willpower : deck.bod;
            const drLabel  = isSparky(ic.type) ? `Willpower (${character.attributes.willpower})` : `Bod (${deck.bod})`;
            const totalDR  = drStatDice + suppressionPool + defensePool;
            return (
              <>
                {parryBonus      > 0 && <BonusBanner color="#06b6d4" label={`PARRY: IC attacked at TN ${icAtkTN} (+${parryBonus})`} />}
                {icAtkTNReduction > 0 && <BonusBanner color="#ef4444" label={`IC POSITION: attack TN ${icAtkTN} (-${icAtkTNReduction})`} />}
                {icPowerBonus    > 0 && <BonusBanner color="#ef4444" label={`IC POSITION POWER: +${icPowerBonus} power`} />}
                {icExpertBonus   > 0 && <BonusBanner color="#f97316" label={`EXPERT: IC attack +${icExpertBonus} dice`} />}
                {cascadeBonus    > 0 && <BonusBanner color="#f97316" label={`CASCADE: IC attack +${cascadeBonus} dice`} />}

                <div className="border border-[var(--color-border)] p-2 flex flex-col gap-1">
                  <InfoRow label="IC attack" value={`${Math.max(1, ic.currentRating - icNetDamage) + icExpertBonus + cascadeBonus}d vs TN ${icAtkTN} (${defLabel})`} />
                  <InfoRow label="Base damage" value={`Power ${power}, Level ${base}`} />
                  {isSparky(ic.type)
                    ? <InfoRow label="DR test" value={`${drLabel} vs TN ${drTN} (IC rating — Sparky)`} highlight />
                    : <InfoRow label="DR test" value={`${drLabel} vs TN ${drTN}`} highlight />}
                  {armorRating > 0 && !isSparky(ic.type) && (
                    <InfoRow label="Armor" value={`-${armorRating} power → TN ${drTN}`} />
                  )}
                  {suppressionPool > 0 && <InfoRow label="Suppression" value={`+${suppressionPool} dice (auto)`} />}
                  <InfoRow label="Total DR dice" value={`${drStatDice} + ${suppressionPool} suppress + ${defensePool} pool = ${totalDR}`} />
                  {isAttributeTargeting(ic.type) && ic.targetAttribute && (
                    <InfoRow label="Damage target" value={`${ATTR_LABEL[ic.targetAttribute as PersonaAttribute]} attribute`} />
                  )}
                </div>

                <RollResultBlock label={`IC attack — TN ${icAtkTN} (${defLabel})`} roll={icAttackRoll} />

                {!counterDone && (
                  <PoolSlider label={`DR pool bonus (${suppressionPool} suppression auto-applied)`}
                    value={defensePool} max={hackingPoolAvailable - offensePool} onChange={setDefensePool} />
                )}
                {!counterDone && (
                  <button onClick={handleDRRoll}
                    className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}>
                    [ ROLL DAMAGE RESISTANCE ({isSparky(ic.type) ? 'Willpower' : 'Bod'}) ]
                  </button>
                )}

                {counterDone && deckerDRRoll && (
                  <>
                    <RollResultBlock label={`DR — ${drLabel} vs TN ${drTN}`} roll={deckerDRRoll} />
                    <div className="border p-2"
                      style={{ borderColor: (pendingPersonaBoxes > 0 || pendingBodyStun > 0 || pendingBodyPhys > 0 || pendingAttrDamage) ? '#ef4444' : '#22c55e' }}>
                      <StagingSummary
                        ic={ic} baseLevel={baseLevel} stagedLevel={stagedLevel}
                        icHits={icAttackRoll.successes} deckerHits={deckerDRRoll.successes}
                        personaBoxes={pendingPersonaBoxes} bodyStun={pendingBodyStun} bodyPhys={pendingBodyPhys}
                        attrDamage={pendingAttrDamage} causedDump={pendingCausedDump} />
                    </div>
                    {pendingCausedDump && (
                      <div className="border border-[#ef4444] p-2 text-center text-[13px] font-bold tracking-wider"
                        style={{ color: '#ef4444', backgroundColor: '#ef444420' }}>
                        RIPPER DUMP — {ic.targetAttribute} hits 0 — DECKER IS EJECTED
                      </div>
                    )}
                    <button onClick={handleApplyAndClose}
                      className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                      style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                      [ APPLY DAMAGE & CLOSE ]
                    </button>
                  </>
                )}
              </>
            );
          })()}

          {/* ── EVADED phase ── */}
          {phase === 'evaded' && manDeckerRoll && manICRoll && (
            <>
              <div className="border border-[#a855f7] p-4 text-center" style={{ backgroundColor: '#a855f710' }}>
                <div className="text-[#a855f7] font-bold text-[15px] tracking-widest">IC EVADED</div>
                <div className="text-[var(--color-foreground)] text-[13px] mt-2">
                  IC cannot detect decker for <span className="font-bold text-[#a855f7]">{evadeTurns} turn{evadeTurns !== 1 ? 's' : ''}</span>
                </div>
                <div className="text-[var(--color-muted-foreground)] text-[11px] mt-2">
                  Each tally point gained shortens the timer by 1.
                </div>
              </div>
              <RollResultBlock label={`Decker Evasion ${manDeckerRoll.dice.length}d vs TN ${manDeckerRoll.targetNumber}`} roll={manDeckerRoll} />
              <RollResultBlock label={`Host SV ${manICRoll.dice.length}d vs TN ${manICRoll.targetNumber}`} roll={manICRoll} />
              <button
                onClick={() => onResult({
                  icDamage: 0, icCrashed: false, personaBoxes: 0, personaDamageLevel: null,
                  bodyStun: 0, bodyPhys: 0, ...NULL_RESULT_EXTRAS, icCategory: ic.category, evadeTurns,
                  log: `Evade: ${manDeckerRoll.successes} vs ${manICRoll.successes} — IC evaded ${evadeTurns} turns.`,
                })}
                className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                style={{ borderColor: '#a855f7', color: '#a855f7' }}>
                [ APPLY & CLOSE ]
              </button>
            </>
          )}

          {/* ── CATASTROPHIC phase ── */}
          {phase === 'catastrophic' && (
            <>
              <div className="text-center text-[16px] font-bold tracking-widest py-3 border"
                style={{ borderColor: '#ef4444', color: '#ef4444', backgroundColor: '#ef444410' }}>
                ALL DICE SHOWED 1s — CATASTROPHIC FAILURE
              </div>
              <div className="text-[12px] text-[var(--color-muted-foreground)] text-center">
                Persona takes 1 box (Light). IC counterattack skipped.
              </div>
              {attackRoll && <RollResultBlock label="Failed attack" roll={attackRoll} />}
              <button
                onClick={() => onResult({
                  icDamage: 0, icCrashed: false, personaBoxes: 1, personaDamageLevel: 'L',
                  bodyStun: 0, bodyPhys: 0, ...NULL_RESULT_EXTRAS, icCategory: ic.category, evadeTurns: 0,
                  log: 'CATASTROPHIC FAILURE — Persona takes 1 box (Light).',
                })}
                className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}>
                [ ACCEPT DAMAGE & CLOSE ]
              </button>
            </>
          )}

        </div>

        <div className="px-4 pb-3">
          <button onClick={onClose}
            className="w-full py-1 text-[12px] tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border border-[var(--color-border)]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper components ────────────────────────────────────────────────────────

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="font-bold text-right" style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-foreground)' }}>
        {value}
      </span>
    </div>
  );
}

function RollResultBlock({ label, roll }: { label: string; roll: DiceRoll }) {
  return (
    <div className="border border-[var(--color-border)] p-2">
      <div className="text-[11px] text-[var(--color-muted-foreground)] tracking-wider mb-1">{label}</div>
      <div className="flex flex-wrap gap-1 my-1">
        {roll.dice.map((d, i) => {
          const hit = d >= roll.targetNumber;
          return (
            <div key={i} className="w-7 h-7 flex items-center justify-center text-[13px] font-bold border"
              style={{ borderColor: hit ? '#22c55e' : '#ef444466', color: hit ? '#22c55e' : '#ef4444',
                backgroundColor: hit ? '#22c55e18' : '#ef444410' }}>
              {d}
            </div>
          );
        })}
      </div>
      <div className="text-[12px] mt-1">
        <span className="text-[var(--color-muted-foreground)]">Successes: </span>
        <span className="font-bold"
          style={{ color: roll.isCatastrophic ? '#ef4444' : roll.successes > 0 ? '#22c55e' : 'var(--color-muted-foreground)' }}>
          {roll.isCatastrophic ? 'CATASTROPHIC' : roll.successes}
        </span>
      </div>
    </div>
  );
}

function PoolSlider({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  if (max <= 0) return <div className="text-[11px] text-[var(--color-muted-foreground)] italic">No hacking pool available</div>;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] text-[var(--color-muted-foreground)]">
        <span>{label}</span>
        <span style={{ color: 'var(--color-primary)' }}>{value} dice</span>
      </div>
      <input type="range" min={0} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))} className="w-full accent-[var(--color-primary)]" />
      <div className="flex justify-between text-[11px] text-[var(--color-muted-foreground)]">
        <span>0</span><span>{max}</span>
      </div>
    </div>
  );
}

function ManeuverButton({ icon, title, subtitle, color, onClick }: {
  icon: string; title: string; subtitle: string; color: string; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full p-2.5 border text-left hover:opacity-80 transition-opacity"
      style={{ borderColor: `${color}66`, backgroundColor: `${color}08` }}>
      <div className="flex items-center gap-2">
        <span className="text-[16px]">{icon}</span>
        <span className="font-bold text-[12px] tracking-wider" style={{ color }}>{title}</span>
      </div>
      <div className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5 ml-6">{subtitle}</div>
    </button>
  );
}

function ManeuverRollInfo({ maneuverType, deckerEvasion, cloakRating, hostSV }: {
  maneuverType: ManeuverType; deckerEvasion: number; cloakRating: number; hostSV: number;
}) {
  const tn = Math.max(2, hostSV - cloakRating);
  const desc = maneuverType === 'evade'  ? 'Win: IC evaded for net successes turns.'
    : maneuverType === 'parry'           ? 'Win: IC attack TN +net successes this exchange.'
    : 'Win: choose TN reduction or Power bonus. IC win: IC gets the bonus.';
  return (
    <div className="border border-[var(--color-border)] p-2 flex flex-col gap-1">
      <div className="text-[11px] text-[var(--color-muted-foreground)] italic mb-1">{desc}</div>
      <InfoRow label="Decker" value={`Evasion ${deckerEvasion}d vs TN ${tn}${cloakRating > 0 ? ` (SV${hostSV}-Cloak${cloakRating})` : ''}`} />
      <InfoRow label="IC" value={`Host SV ${hostSV}d vs TN ${deckerEvasion} (Decker Evasion)`} />
    </div>
  );
}

function ManeuverResultBanner({ maneuverType, netSuccesses, deckerWon }: {
  maneuverType: ManeuverType; netSuccesses: number; deckerWon: boolean;
}) {
  const abs = Math.abs(netSuccesses);
  let msg = ''; let color = '#22c55e';
  if (deckerWon) {
    if (maneuverType === 'evade')   msg = `Success — IC evaded ${netSuccesses} turn${netSuccesses !== 1 ? 's' : ''}`;
    else if (maneuverType === 'parry') msg = `Success — IC attack TN +${netSuccesses}`;
    else msg = `Success — Choose: TN-${netSuccesses} or +${netSuccesses} Power`;
  } else {
    color = '#ef4444';
    if (maneuverType === 'evade')   msg = `Failed (IC +${abs})`;
    else if (maneuverType === 'parry') msg = `Failed — no bonus (IC wins Parry = no effect)`;
    else msg = `BACKFIRED — IC gets TN-${abs} on counterattack`;
  }
  return (
    <div className="border p-2 text-center font-bold text-[12px]" style={{ borderColor: color, color, backgroundColor: `${color}10` }}>
      {msg}
    </div>
  );
}

function BonusBanner({ color, label }: { color: string; label: string }) {
  return (
    <div className="border px-2 py-1 text-[11px] font-bold tracking-wider"
      style={{ borderColor: `${color}66`, color, backgroundColor: `${color}10` }}>
      {label}
    </div>
  );
}

function ICOptionBadges({ ic, expertBonus, shieldDice, armorBonus }: {
  ic: ICInstance; expertBonus: number; shieldDice: number; armorBonus: number;
}) {
  return (
    <div className="border border-[var(--color-border)] p-2">
      <div className="text-[10px] text-[var(--color-muted-foreground)] uppercase tracking-wider mb-1.5">IC Options</div>
      <div className="flex flex-wrap gap-1.5">
        {ic.options.map(opt => {
          let detail = '';
          let color  = '#94a3b8';
          if (opt === 'Armor')     { detail = ` (-${armorBonus} decker net)`;  color = '#f97316'; }
          if (opt === 'Shield')    { detail = ` (+${shieldDice} IC def dice)`;  color = '#06b6d4'; }
          if (opt === 'Expert')    { detail = ` (±${expertBonus} atk/def)`;    color = '#eab308'; }
          if (opt === 'Cascading') { detail = ' (+1/miss, stacks)';            color = '#f59e0b'; }
          if (opt === 'Trap')      { detail = ' (triggers on attack)';         color = '#ef4444'; }
          if (opt === 'Shift')     { detail = ' (morphs on crash)';            color = '#a855f7'; }
          if (opt === 'Party')     { detail = ' (clustered)';                  color = '#94a3b8'; }
          return (
            <div key={opt} className="text-[11px] px-1.5 py-0.5 border font-bold"
              style={{ borderColor: `${color}66`, color, backgroundColor: `${color}10` }}>
              {opt}{detail}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StagingSummary({ ic, baseLevel, stagedLevel, icHits, deckerHits,
  personaBoxes, bodyStun, bodyPhys, attrDamage, causedDump }: {
  ic: ICInstance; baseLevel: DmgLevel; stagedLevel: DmgLevel;
  icHits: number; deckerHits: number;
  personaBoxes: number; bodyStun: number; bodyPhys: number;
  attrDamage: { attribute: string; boxes: number } | null;
  causedDump: boolean;
}) {
  const totalBoxes = personaBoxes + bodyStun + bodyPhys + (attrDamage?.boxes ?? 0);
  const netIC = Math.max(0, icHits - deckerHits);
  const netDecker = Math.max(0, deckerHits - icHits);
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      <div className="flex justify-between">
        <span className="text-[var(--color-muted-foreground)]">IC {icHits} hits vs DR {deckerHits} hits</span>
        {netIC > 0
          ? <span style={{ color: '#ef4444' }}>IC +{netIC}</span>
          : netDecker > 0
          ? <span style={{ color: '#22c55e' }}>Decker +{netDecker}</span>
          : <span style={{ color: 'var(--color-muted-foreground)' }}>Tied</span>}
      </div>
      {baseLevel !== stagedLevel
        ? <div className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Staging</span><span style={{ color: '#ef4444' }}>{baseLevel} → {stagedLevel}</span></div>
        : <div className="flex justify-between"><span className="text-[var(--color-muted-foreground)]">Damage Level</span><span style={{ color: '#ef4444' }}>{baseLevel}</span></div>}
      {totalBoxes === 0
        ? <div className="font-bold text-center" style={{ color: '#22c55e' }}>Decker defended — no damage</div>
        : <div className="font-bold" style={{ color: '#ef4444' }}>
            {ic.type} hits: {LEVEL_LABEL[stagedLevel]}
            {personaBoxes > 0  && ` → PERSONA +${personaBoxes} boxes`}
            {bodyStun     > 0  && ` → STUN +${bodyStun}`}
            {bodyPhys     > 0  && ` → PHYSICAL +${bodyPhys}`}
            {attrDamage        && ` → ${attrDamage.attribute.toUpperCase()} -${attrDamage.boxes} boxes`}
            {causedDump        && ' — DUMP!'}
            {personaBoxes >= 10 && ' — PERSONA CRASH!'}
          </div>}
    </div>
  );
}
