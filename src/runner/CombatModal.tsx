import { useState, useCallback } from 'react';
import { rollDice } from '@/engine/diceEngine';
import type {
  ICInstance, Program, CharacterSheet, RunnerSession,
  ICType, DiceRoll, SecurityCode,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CombatResult {
  icDamage: number;
  icCrashed: boolean;
  personaBoxes: number;          // boxes on icon condition monitor (0 for Black/Sparky)
  personaDamageLevel: DmgLevel | null; // staged level, null if no persona damage
  bodyStun: number;
  bodyPhys: number;
  icCategory: string;            // used to gate simsense overload (white/gray only)
  log: string;
}

interface CombatModalProps {
  ic: ICInstance;
  attackProgram: Program;
  character: CharacterSheet;
  session: RunnerSession;
  hackingPoolAvailable: number;
  suppressionPool: number;
  onClose: () => void;
  onResult: (result: CombatResult) => void;
}

// ─── SR3 / Matrix3 damage staging ────────────────────────────────────────────

type DmgLevel = 'L' | 'M' | 'S' | 'D';
const LEVEL_ORDER: DmgLevel[] = ['L', 'M', 'S', 'D'];
const LEVEL_BOXES: Record<DmgLevel, number> = { L: 1, M: 3, S: 6, D: 10 };
const LEVEL_LABEL: Record<DmgLevel, string> = {
  L: 'Light (1 box)',
  M: 'Moderate (3 boxes)',
  S: 'Serious (6 boxes)',
  D: 'Deadly (10 boxes)',
};

/** Base damage level from host security code — per SR3/Matrix3 proactive IC table */
function baseDamageLevel(code: SecurityCode): DmgLevel {
  if (code === 'UV')   return 'D';
  if (code === 'Red')  return 'S';
  if (code === 'Orange') return 'S';
  return 'M'; // Blue / Green
}

/**
 * Stage the base damage level using net successes.
 * Attacker more → stage UP (every 2 net = +1 level).
 * Defender more → stage DOWN (every 2 net = −1 level).
 */
function stageDamage(base: DmgLevel, icSuccesses: number, deckerSuccesses: number): DmgLevel {
  const idx = LEVEL_ORDER.indexOf(base);
  if (icSuccesses > deckerSuccesses) {
    const up = Math.floor((icSuccesses - deckerSuccesses) / 2);
    return LEVEL_ORDER[Math.min(3, idx + up)];
  }
  const down = Math.floor((deckerSuccesses - icSuccesses) / 2);
  return LEVEL_ORDER[Math.max(0, idx - down)];
}

// ─── IC category helpers ──────────────────────────────────────────────────────

const REACTIVE_IC_TYPES: ICType[] = [
  'Probe', 'Trace', 'TarBaby', 'TarPit', 'TraceWithTrap',
  'ProbeWithTrap', 'ScoutWithTrap',
];

function isReactive(type: ICType): boolean {
  return REACTIVE_IC_TYPES.includes(type);
}

/** IC attack TN = defender's persona attribute (value, not damage-reduced) */
function defenseAttrLabel(ic: ICInstance): string {
  switch (ic.category) {
    case 'ProactiveWhite': return 'Evasion';
    case 'ProactiveGray':  return 'Sensors';
    case 'Black':          return 'Bod';
    default:               return 'Evasion';
  }
}

function defenseAttrValue(ic: ICInstance, char: CharacterSheet): number {
  switch (ic.category) {
    case 'ProactiveWhite': return char.deck.evasion;
    case 'ProactiveGray':  return char.deck.sensors;
    case 'Black':          return char.deck.bod;
    default:               return char.deck.evasion;
  }
}

/** Is this IC a Black IC that deals body damage instead of persona boxes? */
function isBodyDamage(type: ICType): boolean {
  return ['Psychotropic', 'NonLethal', 'Cerebropathic', 'Lethal', 'Sparky'].includes(type);
}

function isLethal(type: ICType): boolean {
  return ['Lethal', 'Cerebropathic'].includes(type);
}

// ─── Dice display component ───────────────────────────────────────────────────

function DiceRow({ roll }: { roll: DiceRoll }) {
  return (
    <div className="flex flex-wrap gap-1 my-1">
      {roll.dice.map((d, i) => {
        const hit = d >= roll.targetNumber;
        return (
          <div
            key={i}
            className="w-7 h-7 flex items-center justify-center text-[13px] font-bold border"
            style={{
              borderColor: hit ? '#22c55e' : '#ef444466',
              color: hit ? '#22c55e' : '#ef4444',
              backgroundColor: hit ? '#22c55e18' : '#ef444410',
            }}
          >
            {d}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

type Phase = 'attack' | 'counterattack' | 'catastrophic';

export default function CombatModal({
  ic,
  attackProgram,
  character,
  session,
  hackingPoolAvailable,
  suppressionPool,
  onClose,
  onResult,
}: CombatModalProps) {
  const [phase, setPhase] = useState<Phase>('attack');
  const [offensePool, setOffensePool] = useState(0);
  const [defensePool, setDefensePool] = useState(0);

  // Phase 1 results
  const [attackRoll, setAttackRoll] = useState<DiceRoll | null>(null);
  const [icDefenseRoll, setIcDefenseRoll] = useState<DiceRoll | null>(null);
  const [icNetDamage, setIcNetDamage] = useState(0);
  const [attackDone, setAttackDone] = useState(false);

  // Phase 2 results
  const [icAttackRoll, setIcAttackRoll] = useState<DiceRoll | null>(null);
  const [deckerDRRoll, setDeckerDRRoll] = useState<DiceRoll | null>(null);
  const [counterDone, setCounterDone] = useState(false);
  const [pendingPersonaBoxes, setPendingPersonaBoxes] = useState(0);
  const [pendingBodyStun, setPendingBodyStun] = useState(0);
  const [pendingBodyPhys, setPendingBodyPhys] = useState(0);
  const [stagedLevel, setStagedLevel] = useState<DmgLevel>('L');
  const [baseLevel, setBaseLevel] = useState<DmgLevel>('L');

  // ── Derived constants ──
  const host = session.runPacket?.hosts?.find(h => h.id === session.currentHostId);
  const secCode: SecurityCode = host?.securityCode ?? 'Green';
  const deck = character.deck;

  const defLabel = defenseAttrLabel(ic);
  const defVal = defenseAttrValue(ic, character);

  // Armor utility reduces Power of incoming damage
  const armorProg = session.loadedPrograms.find(
    p => p.loaded && p.name.toLowerCase() === 'armor',
  );
  const armorRating = armorProg?.rating ?? 0;

  // ── Phase 1: Decker Attacks ──────────────────────────────────────────────────

  const handleAttackRoll = useCallback(() => {
    const attackDice = attackProgram.rating + offensePool;
    const atkTN = ic.currentRating;
    const defDice = ic.currentRating;
    const defTN = attackProgram.rating;

    const atkRoll = rollDice(attackDice, atkTN, `Attack (${attackProgram.name} ${attackProgram.rating})`);
    const defRoll = rollDice(defDice, defTN, `IC defense`);

    setAttackRoll(atkRoll);
    setIcDefenseRoll(defRoll);

    if (atkRoll.isCatastrophic) {
      setPhase('catastrophic');
      return;
    }

    const net = Math.max(0, atkRoll.successes - defRoll.successes);
    setIcNetDamage(net);
    setAttackDone(true);
  }, [attackProgram, ic.currentRating, offensePool]);

  const handleProceedToCounterattack = useCallback(() => {
    const icDiceAfterDmg = Math.max(1, ic.currentRating - icNetDamage);
    // IC attacks vs decker's defense persona attribute (Evasion / Sensors / Bod)
    const icRoll = rollDice(icDiceAfterDmg, defVal, `${ic.type}-${icDiceAfterDmg} attack`);
    setIcAttackRoll(icRoll);
    setPhase('counterattack');
  }, [ic, icNetDamage, defVal]);

  // ── Phase 2: Decker rolls Damage Resistance ──────────────────────────────────

  const handleDRRoll = useCallback(() => {
    if (!icAttackRoll) return;

    // Power = IC effective rating after phase-1 damage, reduced by Armor utility
    const power = Math.max(1, ic.currentRating - icNetDamage);
    const drTN = Math.max(2, power - armorRating);
    const drDice = deck.bod + suppressionPool + defensePool;

    const drRoll = rollDice(drDice, drTN, `Damage Resistance (Bod ${deck.bod}${armorRating > 0 ? `, Armor-${armorRating}` : ''})`);
    setDeckerDRRoll(drRoll);

    const base = ic.damageCode ?? baseDamageLevel(secCode);
    const staged = stageDamage(base, icAttackRoll.successes, drRoll.successes);
    const boxes = LEVEL_BOXES[staged];

    setBaseLevel(base);
    setStagedLevel(staged);

    if (!isReactive(ic.type) && (icAttackRoll.successes > 0 || drRoll.successes === 0)) {
      if (isBodyDamage(ic.type)) {
        if (isLethal(ic.type)) {
          setPendingBodyPhys(boxes);
        } else {
          setPendingBodyStun(boxes);
        }
        setPendingPersonaBoxes(0);
      } else {
        setPendingPersonaBoxes(boxes);
        setPendingBodyStun(0);
        setPendingBodyPhys(0);
      }
    } else {
      setPendingPersonaBoxes(0);
      setPendingBodyStun(0);
      setPendingBodyPhys(0);
    }

    setCounterDone(true);
  }, [icAttackRoll, defensePool, suppressionPool, deck.bod, ic, icNetDamage, armorRating, secCode]);

  const handleApplyAndClose = useCallback(() => {
    if (!attackRoll || !icDefenseRoll) return;
    const newRating = ic.currentRating - icNetDamage;

    let log = `Attack (${attackProgram.name}): ${attackRoll.successes} hits vs IC ${icDefenseRoll.successes} hits`;
    if (icNetDamage > 0) log += ` — IC -${icNetDamage} rating`;
    if (newRating <= 0) log += ` — IC CRASHED`;
    if (icAttackRoll && deckerDRRoll) {
      const power = Math.max(1, ic.currentRating - icNetDamage);
      const drTN = Math.max(2, power - armorRating);
      log += ` | Counterattack: IC ${icAttackRoll.successes} hits, DR Bod(${deck.bod}) vs TN${drTN}: ${deckerDRRoll.successes} hits`;
      log += ` — base ${baseLevel} → staged ${stagedLevel} = ${LEVEL_BOXES[stagedLevel]} boxes`;
    }

    onResult({
      icDamage: icNetDamage,
      icCrashed: newRating <= 0,
      personaBoxes: pendingPersonaBoxes,
      personaDamageLevel: pendingPersonaBoxes > 0 ? stagedLevel : null,
      bodyStun: pendingBodyStun,
      bodyPhys: pendingBodyPhys,
      icCategory: ic.category,
      log,
    });
  }, [
    attackRoll, icDefenseRoll, icNetDamage, ic, attackProgram,
    icAttackRoll, deckerDRRoll, armorRating, deck.bod,
    baseLevel, stagedLevel, pendingPersonaBoxes, pendingBodyStun, pendingBodyPhys, onResult,
  ]);

  const handleCatastrophicClose = useCallback(() => {
    onResult({
      icDamage: 0,
      icCrashed: false,
      personaBoxes: 1,
      personaDamageLevel: 'L',
      bodyStun: 0,
      bodyPhys: 0,
      icCategory: ic.category,
      log: 'CATASTROPHIC FAILURE — Persona takes 1 box (Light damage). IC counterattack skipped.',
    });
  }, [onResult]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="flex flex-col gap-0 border font-mono text-[13px] overflow-y-auto"
        style={{
          width: 520,
          maxHeight: '90vh',
          borderColor: 'var(--color-primary)',
          backgroundColor: 'var(--color-card)',
          boxShadow: '0 0 30px var(--color-primary)44',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-2 border-b text-[14px] font-bold tracking-widest"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          {phase === 'counterattack'
            ? 'IC COUNTERATTACK — DAMAGE RESISTANCE'
            : phase === 'catastrophic'
            ? 'CATASTROPHIC FAILURE'
            : `CYBERCOMBAT — ${ic.type}-${ic.currentRating}`}
        </div>

        <div className="p-4 flex flex-col gap-3">

          {/* ── Catastrophic glitch ── */}
          {phase === 'catastrophic' && (
            <>
              <div
                className="text-center text-[16px] font-bold tracking-widest py-3 border"
                style={{ borderColor: '#ef4444', color: '#ef4444', backgroundColor: '#ef444410' }}
              >
                ALL DICE SHOWED 1s
              </div>
              <div className="text-[12px] text-[var(--color-muted-foreground)] text-center">
                Persona takes 1 box (Light damage). IC counterattack skipped.
              </div>
              {attackRoll && <DiceRow roll={attackRoll} />}
              <button
                onClick={handleCatastrophicClose}
                className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80 transition-opacity"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
              >
                [ ACCEPT DAMAGE & CLOSE ]
              </button>
            </>
          )}

          {/* ── Phase 1: Decker attacks ── */}
          {phase === 'attack' && (
            <>
              <div className="flex flex-col gap-1 border border-[var(--color-border)] p-2">
                <InfoRow label="Attack Program" value={`${attackProgram.name} (Rating ${attackProgram.rating})`} />
                <InfoRow label="Attack dice" value={`${attackProgram.rating} + ${offensePool} pool = ${attackProgram.rating + offensePool}`} />
                <InfoRow label="TN (IC rating)" value={String(ic.currentRating)} highlight />
                <InfoRow label="IC defends with" value={`${ic.currentRating} dice, TN ${attackProgram.rating}`} />
              </div>

              {!attackDone && (
                <PoolSlider
                  label="Offense hacking pool"
                  value={offensePool}
                  max={hackingPoolAvailable}
                  onChange={setOffensePool}
                />
              )}

              {!attackDone && (
                <button
                  onClick={handleAttackRoll}
                  className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10 transition-colors"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                >
                  [ ROLL ATTACK ]
                </button>
              )}

              {attackDone && attackRoll && icDefenseRoll && (
                <>
                  <RollResultBlock label={`Decker attack — TN ${ic.currentRating}`} roll={attackRoll} />
                  <RollResultBlock label={`IC defense — TN ${attackProgram.rating}`} roll={icDefenseRoll} />
                  <div
                    className="border p-2 text-center"
                    style={{ borderColor: icNetDamage > 0 ? 'var(--color-primary)' : 'var(--color-border)' }}
                  >
                    {icNetDamage > 0 ? (
                      <span style={{ color: 'var(--color-primary)' }}>
                        NET {icNetDamage} — IC rating reduced by {icNetDamage}
                        {ic.currentRating - icNetDamage <= 0 ? ' — IC CRASHED' : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-muted-foreground)' }}>No net successes — IC holds</span>
                    )}
                  </div>

                  {isReactive(ic.type) ? (
                    <button
                      onClick={() => {
                        onResult({
                          icDamage: icNetDamage,
                          icCrashed: ic.currentRating - icNetDamage <= 0,
                          personaBoxes: 0,
                          personaDamageLevel: null,
                          bodyStun: 0,
                          bodyPhys: 0,
                          icCategory: ic.category,
                          log: `Attack: ${attackRoll.successes} hits vs IC ${icDefenseRoll.successes} hits — net ${icNetDamage}. Reactive IC: no counterattack.`,
                        });
                      }}
                      className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10 transition-colors"
                      style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                    >
                      [ APPLY & CLOSE (Reactive IC) ]
                    </button>
                  ) : (
                    <button
                      onClick={handleProceedToCounterattack}
                      className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10 transition-colors"
                      style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                    >
                      [ CONTINUE → IC STRIKES BACK ]
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Phase 2: IC Counterattacks → Damage Resistance ── */}
          {phase === 'counterattack' && icAttackRoll && (() => {
            const power = Math.max(1, ic.currentRating - icNetDamage);
            const drTN = Math.max(2, power - armorRating);
            const base = ic.damageCode ?? baseDamageLevel(secCode);
            return (
              <>
                <div className="flex flex-col gap-1 border border-[var(--color-border)] p-2">
                  <InfoRow label="IC type" value={`${ic.type} (${ic.category})`} />
                  <InfoRow label="Host security code" value={secCode} />
                  <InfoRow label="Base damage code" value={`${power}${base} — Power ${power}, Level ${base}`} />
                  <InfoRow label="IC attack" value={`${power} dice vs TN ${defVal} (${defLabel})`} />
                  <InfoRow label="DR test" value={`Bod ${deck.bod} dice vs TN ${drTN}`} highlight />
                  {armorRating > 0 && (
                    <InfoRow label="Armor utility" value={`Armor-${armorRating} reduces Power: ${power + armorRating} → ${power}`} />
                  )}
                  {suppressionPool > 0 && (
                    <InfoRow label="Suppression auto-applied" value={`+${suppressionPool} dice`} />
                  )}
                  <InfoRow
                    label="Total DR dice"
                    value={suppressionPool > 0
                      ? `${deck.bod} Bod + ${suppressionPool} suppress + ${defensePool} extra = ${deck.bod + suppressionPool + defensePool}`
                      : `${deck.bod} Bod + ${defensePool} extra = ${deck.bod + defensePool}`}
                  />
                </div>

                <RollResultBlock label={`IC attack — TN ${defVal} (${defLabel})`} roll={icAttackRoll} />

                {!counterDone && (
                  <PoolSlider
                    label={suppressionPool > 0
                      ? `Additional DR pool (${suppressionPool} suppression auto-applied)`
                      : 'DR hacking pool bonus'}
                    value={defensePool}
                    max={hackingPoolAvailable - offensePool}
                    onChange={setDefensePool}
                  />
                )}

                {!counterDone && (
                  <button
                    onClick={handleDRRoll}
                    className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[var(--color-primary)]/10 transition-colors"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    [ ROLL DAMAGE RESISTANCE (Bod) ]
                  </button>
                )}

                {counterDone && deckerDRRoll && (
                  <>
                    <RollResultBlock label={`DR Test — Bod(${deck.bod}) vs TN ${drTN}`} roll={deckerDRRoll} />
                    <div
                      className="border p-2"
                      style={{ borderColor: (pendingPersonaBoxes > 0 || pendingBodyStun > 0 || pendingBodyPhys > 0) ? '#ef4444' : '#22c55e' }}
                    >
                      <StagingSummary
                        ic={ic}
                        baseLevel={baseLevel}
                        stagedLevel={stagedLevel}
                        icHits={icAttackRoll.successes}
                        deckerHits={deckerDRRoll.successes}
                        personaBoxes={pendingPersonaBoxes}
                        bodyStun={pendingBodyStun}
                        bodyPhys={pendingBodyPhys}
                      />
                    </div>

                    <button
                      onClick={handleApplyAndClose}
                      className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80 transition-opacity"
                      style={{ borderColor: '#ef4444', color: '#ef4444' }}
                    >
                      [ APPLY DAMAGE & CLOSE ]
                    </button>
                  </>
                )}
              </>
            );
          })()}

        </div>

        <div className="px-4 pb-3">
          <button
            onClick={onClose}
            className="w-full py-1 text-[12px] tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border border-[var(--color-border)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span
        className="font-bold"
        style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-foreground)' }}
      >
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
            <div
              key={i}
              className="w-7 h-7 flex items-center justify-center text-[13px] font-bold border"
              style={{
                borderColor: hit ? '#22c55e' : '#ef444466',
                color: hit ? '#22c55e' : '#ef4444',
                backgroundColor: hit ? '#22c55e18' : '#ef444410',
              }}
            >
              {d}
            </div>
          );
        })}
      </div>
      <div className="text-[12px] mt-1">
        <span className="text-[var(--color-muted-foreground)]">Successes: </span>
        <span
          className="font-bold"
          style={{ color: roll.isCatastrophic ? '#ef4444' : roll.successes > 0 ? '#22c55e' : 'var(--color-muted-foreground)' }}
        >
          {roll.isCatastrophic ? 'CATASTROPHIC' : roll.successes}
        </span>
      </div>
    </div>
  );
}

function PoolSlider({
  label, value, max, onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  if (max <= 0) {
    return <div className="text-[11px] text-[var(--color-muted-foreground)] italic">No hacking pool available</div>;
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[11px] text-[var(--color-muted-foreground)]">
        <span>{label}</span>
        <span style={{ color: 'var(--color-primary)' }}>{value} dice</span>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-primary)]"
      />
      <div className="flex justify-between text-[11px] text-[var(--color-muted-foreground)]">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function StagingSummary({
  ic, baseLevel, stagedLevel, icHits, deckerHits,
  personaBoxes, bodyStun, bodyPhys,
}: {
  ic: ICInstance;
  baseLevel: DmgLevel;
  stagedLevel: DmgLevel;
  icHits: number;
  deckerHits: number;
  personaBoxes: number;
  bodyStun: number;
  bodyPhys: number;
}) {
  const totalBoxes = personaBoxes + bodyStun + bodyPhys;
  const noDamage = totalBoxes === 0;

  const netIC = Math.max(0, icHits - deckerHits);
  const netDecker = Math.max(0, deckerHits - icHits);

  return (
    <div className="flex flex-col gap-1 text-[12px]">
      <div className="flex justify-between">
        <span className="text-[var(--color-muted-foreground)]">IC: {icHits} hits vs DR: {deckerHits} hits</span>
        {netIC > 0
          ? <span style={{ color: '#ef4444' }}>IC +{netIC} net</span>
          : netDecker > 0
          ? <span style={{ color: '#22c55e' }}>Decker +{netDecker} net</span>
          : <span style={{ color: 'var(--color-muted-foreground)' }}>Tied</span>
        }
      </div>
      {baseLevel !== stagedLevel ? (
        <div className="flex justify-between">
          <span className="text-[var(--color-muted-foreground)]">Staging</span>
          <span style={{ color: '#ef4444' }}>{baseLevel} → {stagedLevel}</span>
        </div>
      ) : (
        <div className="flex justify-between">
          <span className="text-[var(--color-muted-foreground)]">Damage Level</span>
          <span style={{ color: '#ef4444' }}>{baseLevel} (no staging)</span>
        </div>
      )}
      {noDamage ? (
        <div className="font-bold text-center" style={{ color: '#22c55e' }}>
          Decker defended — no damage
        </div>
      ) : (
        <div className="font-bold" style={{ color: '#ef4444' }}>
          {ic.type} hits: {LEVEL_LABEL[stagedLevel]}
          {personaBoxes > 0 && ` → PERSONA +${personaBoxes} boxes`}
          {bodyStun > 0    && ` → STUN +${bodyStun}`}
          {bodyPhys > 0    && ` → PHYSICAL +${bodyPhys}`}
          {personaBoxes >= 10 && ' — PERSONA CRASH!'}
        </div>
      )}
    </div>
  );
}
