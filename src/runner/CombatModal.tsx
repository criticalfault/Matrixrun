import { useState, useCallback } from 'react';
import { rollDice } from '@/engine/diceEngine';
import type {
  ICInstance, Program, CharacterSheet, RunnerSession,
  PersonaCondition, ICType, DiceRoll,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CombatResult {
  icDamage: number;
  icCrashed: boolean;
  personaDamage: Partial<PersonaCondition>;
  bodyStun: number;
  bodyPhys: number;
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

// ─── IC category helpers ──────────────────────────────────────────────────────

// Reactive IC types that do not deal counterattack damage
const REACTIVE_IC_TYPES: ICType[] = [
  'Probe', 'Trace', 'TarBaby', 'TarPit', 'TraceWithTrap',
  'ProbeWithTrap', 'ScoutWithTrap',
];

function isReactive(type: ICType): boolean {
  return REACTIVE_IC_TYPES.includes(type);
}

/**
 * Returns the persona attribute name (key in PersonaCondition) used as defense
 * against a given IC category.
 */
function defenseAttributeKey(ic: ICInstance): keyof PersonaCondition {
  switch (ic.category) {
    case 'ProactiveWhite': return 'evasion';
    case 'ProactiveGray':  return 'sensors';
    case 'Black':          return 'bod';
    // Reactive IC won't reach counterattack damage, but provide a fallback
    default:               return 'evasion';
  }
}

function defenseAttributeLabel(ic: ICInstance): string {
  switch (ic.category) {
    case 'ProactiveWhite': return 'Evasion';
    case 'ProactiveGray':  return 'Sensors';
    case 'Black':          return 'Bod';
    default:               return 'Evasion';
  }
}

/** Effective persona attribute value = base - damage (min 1) */
function effectiveAttr(base: number, damage: number): number {
  return Math.max(1, base - damage);
}

/**
 * Build the PersonaCondition damage object from IC counterattack net hits.
 * Returns personaDamage, bodyStun, bodyPhys.
 */
function calcCounterattackDamage(
  ic: ICInstance,
  netHits: number,
): { personaDamage: Partial<PersonaCondition>; bodyStun: number; bodyPhys: number } {
  const personaDamage: Partial<PersonaCondition> = {};
  let bodyStun = 0;
  let bodyPhys = 0;

  switch (ic.type) {
    case 'Killer': {
      // Split net hits across all 4 attributes, 1 each cycling
      const attrs: Array<keyof PersonaCondition> = ['bod', 'evasion', 'masking', 'sensors'];
      for (let i = 0; i < netHits; i++) {
        const key = attrs[i % 4];
        personaDamage[key] = (personaDamage[key] ?? 0) + 1;
      }
      break;
    }
    case 'Crippler': {
      const target = (ic.targetAttribute?.toLowerCase() ?? 'sensors') as keyof PersonaCondition;
      personaDamage[target] = netHits;
      break;
    }
    case 'Scout': {
      personaDamage.sensors = netHits;
      break;
    }
    case 'Blaster': {
      // Net hits ÷ 4, rounded up, to each attribute
      const each = Math.ceil(netHits / 4);
      personaDamage.bod     = each;
      personaDamage.evasion = each;
      personaDamage.masking = each;
      personaDamage.sensors = each;
      break;
    }
    case 'Ripper': {
      const target = (ic.targetAttribute?.toLowerCase() ?? 'sensors') as keyof PersonaCondition;
      personaDamage[target] = netHits * 2;
      break;
    }
    case 'Sparky': {
      bodyStun = netHits;
      break;
    }
    case 'Psychotropic':
    case 'NonLethal': {
      bodyStun = netHits;
      break;
    }
    case 'Lethal':
    case 'Cerebropathic': {
      bodyPhys = netHits;
      break;
    }
    default: {
      personaDamage.sensors = netHits;
      break;
    }
  }

  return { personaDamage, bodyStun, bodyPhys };
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
            className="w-7 h-7 flex items-center justify-center text-[11px] font-bold border"
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

  // Phase 2 results (IC roll auto-computed when entering phase 2)
  const [icAttackRoll, setIcAttackRoll] = useState<DiceRoll | null>(null);
  const [deckerDefenseRoll, setDeckerDefenseRoll] = useState<DiceRoll | null>(null);
  const [counterDone, setCounterDone] = useState(false);
  const [counterNetHits, setCounterNetHits] = useState(0);
  const [pendingDamage, setPendingDamage] = useState<{
    personaDamage: Partial<PersonaCondition>;
    bodyStun: number;
    bodyPhys: number;
  } | null>(null);

  // ── Deck persona values ──
  const deck = character.deck;
  const pc = session.personaCondition;
  const defAttrKey = defenseAttributeKey(ic);
  const defAttrLabel = defenseAttributeLabel(ic);
  const defBase = defAttrKey === 'bod' ? deck.bod
    : defAttrKey === 'evasion' ? deck.evasion
    : defAttrKey === 'sensors' ? deck.sensors
    : deck.masking;
  const defDmg = pc[defAttrKey];
  const effDef = effectiveAttr(defBase, defDmg);

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
    // Auto-roll IC counterattack
    const icDice = Math.max(1, ic.currentRating - icNetDamage);
    // IC attacks vs decker's defense attribute
    const icTN = effDef;
    const icRoll = rollDice(icDice, icTN, `${ic.type}-${ic.currentRating} attack`);
    setIcAttackRoll(icRoll);
    setPhase('counterattack');
  }, [ic, icNetDamage, effDef]);

  // ── Phase 2: IC Counterattacks ───────────────────────────────────────────────

  const handleDefenseRoll = useCallback(() => {
    if (!icAttackRoll) return;
    const defDice = effDef + suppressionPool + defensePool;
    const defTN = Math.max(1, ic.currentRating - icNetDamage);
    const dRoll = rollDice(defDice, defTN, `Decker defense (${defAttrLabel})`);
    setDeckerDefenseRoll(dRoll);

    const net = Math.max(0, icAttackRoll.successes - dRoll.successes);
    setCounterNetHits(net);

    if (net > 0 && !isReactive(ic.type)) {
      const dmg = calcCounterattackDamage(ic, net);
      setPendingDamage(dmg);
    } else {
      setPendingDamage({ personaDamage: {}, bodyStun: 0, bodyPhys: 0 });
    }
    setCounterDone(true);
  }, [icAttackRoll, effDef, defensePool, ic, icNetDamage, defAttrLabel]);

  const handleApplyAndClose = useCallback(() => {
    if (!attackRoll || !icDefenseRoll) return;
    const dmg = pendingDamage ?? { personaDamage: {}, bodyStun: 0, bodyPhys: 0 };
    const newRating = ic.currentRating - icNetDamage;

    // Build log summary
    let log = `Attack (${attackProgram.name}): ${attackRoll.successes} hits vs IC ${icDefenseRoll.successes} hits`;
    if (icNetDamage > 0) log += ` — IC -${icNetDamage} rating`;
    if (newRating <= 0) log += ` — IC CRASHED`;
    if (icAttackRoll && deckerDefenseRoll) {
      log += ` | Counterattack: IC ${icAttackRoll.successes} vs decker ${deckerDefenseRoll.successes}`;
      if (counterNetHits > 0) log += ` — ${counterNetHits} net hits dealt`;
    }

    onResult({
      icDamage: icNetDamage,
      icCrashed: newRating <= 0,
      personaDamage: dmg.personaDamage,
      bodyStun: dmg.bodyStun,
      bodyPhys: dmg.bodyPhys,
      log,
    });
  }, [
    attackRoll, icDefenseRoll, icNetDamage, pendingDamage,
    ic, attackProgram, icAttackRoll, deckerDefenseRoll, counterNetHits, onResult,
  ]);

  const handleCatastrophicClose = useCallback(() => {
    onResult({
      icDamage: 0,
      icCrashed: false,
      personaDamage: { evasion: 1 },
      bodyStun: 0,
      bodyPhys: 0,
      log: 'CATASTROPHIC FAILURE — Decker takes 1 Evasion damage. IC counterattack skipped.',
    });
  }, [onResult]);

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
    >
      <div
        className="flex flex-col gap-0 border font-mono text-[11px] overflow-y-auto"
        style={{
          width: 500,
          maxHeight: '90vh',
          borderColor: 'var(--color-primary)',
          backgroundColor: 'var(--color-card)',
          boxShadow: '0 0 30px var(--color-primary)44',
        }}
      >
        {/* Header */}
        <div
          className="px-4 py-2 border-b text-[12px] font-bold tracking-widest"
          style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
        >
          {phase === 'counterattack'
            ? 'IC COUNTERATTACK'
            : phase === 'catastrophic'
            ? 'CATASTROPHIC FAILURE'
            : `CYBERCOMBAT — ${ic.type}-${ic.currentRating}`}
        </div>

        <div className="p-4 flex flex-col gap-3">

          {/* ── Catastrophic glitch ── */}
          {phase === 'catastrophic' && (
            <>
              <div
                className="text-center text-[14px] font-bold tracking-widest py-3 border"
                style={{ borderColor: '#ef4444', color: '#ef4444', backgroundColor: '#ef444410' }}
              >
                ALL DICE SHOWED 1s
              </div>
              <div className="text-[10px] text-[var(--color-muted-foreground)] text-center">
                Persona takes 1 Evasion damage. IC counterattack skipped.
              </div>
              {attackRoll && <DiceRow roll={attackRoll} />}
              <button
                onClick={handleCatastrophicClose}
                className="w-full py-2 border font-bold tracking-widest text-[11px] hover:opacity-80 transition-opacity"
                style={{ borderColor: '#ef4444', color: '#ef4444' }}
              >
                [ ACCEPT DAMAGE & CLOSE ]
              </button>
            </>
          )}

          {/* ── Phase 1: Decker attacks ── */}
          {(phase === 'attack' || (phase === 'counterattack' && attackDone)) && phase === 'attack' && (
            <>
              {/* Info row */}
              <div className="flex flex-col gap-1 border border-[var(--color-border)] p-2">
                <InfoRow label="Attack Program" value={`${attackProgram.name} (Rating ${attackProgram.rating})`} />
                <InfoRow label="Attack dice" value={`${attackProgram.rating} + ${offensePool} pool = ${attackProgram.rating + offensePool}`} />
                <InfoRow label="TN (IC rating)" value={String(ic.currentRating)} highlight />
                <InfoRow label="IC defends with" value={`${ic.currentRating} dice, TN ${attackProgram.rating}`} />
              </div>

              {/* Offense pool slider */}
              {!attackDone && (
                <PoolSlider
                  label="Offense hacking pool"
                  value={offensePool}
                  max={hackingPoolAvailable}
                  onChange={setOffensePool}
                />
              )}

              {/* Roll button */}
              {!attackDone && (
                <button
                  onClick={handleAttackRoll}
                  className="w-full py-2 border font-bold tracking-widest text-[11px] hover:bg-[var(--color-primary)]/10 transition-colors"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                >
                  [ ROLL ATTACK ]
                </button>
              )}

              {/* Results */}
              {attackDone && attackRoll && icDefenseRoll && (
                <>
                  <RollResultBlock
                    label={`Decker attack — TN ${ic.currentRating}`}
                    roll={attackRoll}
                  />
                  <RollResultBlock
                    label={`IC defense — TN ${attackProgram.rating}`}
                    roll={icDefenseRoll}
                  />
                  <div
                    className="border p-2 text-center"
                    style={{
                      borderColor: icNetDamage > 0 ? 'var(--color-primary)' : 'var(--color-border)',
                    }}
                  >
                    {icNetDamage > 0 ? (
                      <span style={{ color: 'var(--color-primary)' }}>
                        NET {icNetDamage} — IC currentRating reduced by {icNetDamage}
                        {ic.currentRating - icNetDamage <= 0 ? ' — IC CRASHED' : ''}
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-muted-foreground)' }}>
                        No net successes — IC holds
                      </span>
                    )}
                  </div>

                  {isReactive(ic.type) ? (
                    <button
                      onClick={() => {
                        onResult({
                          icDamage: icNetDamage,
                          icCrashed: ic.currentRating - icNetDamage <= 0,
                          personaDamage: {},
                          bodyStun: 0,
                          bodyPhys: 0,
                          log: `Attack: ${attackRoll.successes} hits vs IC ${icDefenseRoll.successes} hits — net ${icNetDamage}. Reactive IC: no counterattack.`,
                        });
                      }}
                      className="w-full py-2 border font-bold tracking-widest text-[11px] hover:bg-[var(--color-primary)]/10 transition-colors"
                      style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                    >
                      [ APPLY & CLOSE (Reactive IC) ]
                    </button>
                  ) : (
                    <button
                      onClick={handleProceedToCounterattack}
                      className="w-full py-2 border font-bold tracking-widest text-[11px] hover:bg-[var(--color-primary)]/10 transition-colors"
                      style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                    >
                      [ CONTINUE → IC STRIKES BACK ]
                    </button>
                  )}
                </>
              )}
            </>
          )}

          {/* ── Phase 2: IC Counterattacks ── */}
          {phase === 'counterattack' && icAttackRoll && (
            <>
              <div className="flex flex-col gap-1 border border-[var(--color-border)] p-2">
                <InfoRow label="IC type" value={`${ic.type} (${ic.category})`} />
                <InfoRow
                  label="IC attack dice"
                  value={`${Math.max(1, ic.currentRating - icNetDamage)} (after -${icNetDamage} damage)`}
                />
                <InfoRow label="Defense attribute" value={`${defAttrLabel} (base ${defBase} - ${defDmg} dmg = eff ${effDef})`} />
                {suppressionPool > 0 && (
                  <InfoRow label="Auto-defense (suppression)" value={`+${suppressionPool} dice`} />
                )}
                <InfoRow
                  label="Defense dice total"
                  value={suppressionPool > 0
                    ? `${effDef} attr + ${suppressionPool} suppress + ${defensePool} extra = ${effDef + suppressionPool + defensePool}`
                    : `${effDef} attr + ${defensePool} extra = ${effDef + defensePool}`}
                />
                <InfoRow label="Decker defense TN" value={String(Math.max(1, ic.currentRating - icNetDamage))} highlight />
              </div>

              {/* IC attack roll display */}
              <RollResultBlock
                label={`IC attack — TN ${effDef}`}
                roll={icAttackRoll}
              />

              {/* Defense pool slider */}
              {!counterDone && (
                <PoolSlider
                  label={suppressionPool > 0 ? `Additional defense pool (${suppressionPool} suppression auto-applied)` : 'Defense hacking pool'}
                  value={defensePool}
                  max={hackingPoolAvailable - offensePool}
                  onChange={setDefensePool}
                />
              )}

              {/* Roll defense button */}
              {!counterDone && (
                <button
                  onClick={handleDefenseRoll}
                  className="w-full py-2 border font-bold tracking-widest text-[11px] hover:bg-[var(--color-primary)]/10 transition-colors"
                  style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                >
                  [ ROLL DEFENSE ]
                </button>
              )}

              {/* Counter results */}
              {counterDone && deckerDefenseRoll && (
                <>
                  <RollResultBlock
                    label={`Decker defense — TN ${Math.max(1, ic.currentRating - icNetDamage)}`}
                    roll={deckerDefenseRoll}
                  />
                  <div
                    className="border p-2 text-center"
                    style={{
                      borderColor: counterNetHits > 0 ? '#ef4444' : 'var(--color-border)',
                    }}
                  >
                    {counterNetHits > 0 && pendingDamage ? (
                      <DamageSummary
                        ic={ic}
                        netHits={counterNetHits}
                        personaDamage={pendingDamage.personaDamage}
                        bodyStun={pendingDamage.bodyStun}
                        bodyPhys={pendingDamage.bodyPhys}
                      />
                    ) : (
                      <span style={{ color: '#22c55e' }}>Decker defended — no damage</span>
                    )}
                  </div>

                  <button
                    onClick={handleApplyAndClose}
                    className="w-full py-2 border font-bold tracking-widest text-[11px] hover:opacity-80 transition-opacity"
                    style={{ borderColor: '#ef4444', color: '#ef4444' }}
                  >
                    [ APPLY DAMAGE & CLOSE ]
                  </button>
                </>
              )}
            </>
          )}

        </div>

        {/* Cancel button at bottom */}
        <div className="px-4 pb-3">
          <button
            onClick={onClose}
            className="w-full py-1 text-[10px] tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] border border-[var(--color-border)] transition-colors"
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
      <div className="text-[9px] text-[var(--color-muted-foreground)] tracking-wider mb-1">{label}</div>
      <DiceRow roll={roll} />
      <div className="text-[10px] mt-1">
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
    return (
      <div className="text-[9px] text-[var(--color-muted-foreground)] italic">No hacking pool available</div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[9px] text-[var(--color-muted-foreground)]">
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
      <div className="flex justify-between text-[9px] text-[var(--color-muted-foreground)]">
        <span>0</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

function DamageSummary({
  ic, netHits, personaDamage, bodyStun, bodyPhys,
}: {
  ic: ICInstance;
  netHits: number;
  personaDamage: Partial<PersonaCondition>;
  bodyStun: number;
  bodyPhys: number;
}) {
  const lines: string[] = [];
  if (personaDamage.bod)     lines.push(`Bod -${personaDamage.bod}`);
  if (personaDamage.evasion) lines.push(`Evasion -${personaDamage.evasion}`);
  if (personaDamage.masking) lines.push(`Masking -${personaDamage.masking}`);
  if (personaDamage.sensors) lines.push(`Sensors -${personaDamage.sensors}`);
  if (bodyStun > 0)          lines.push(`Stun ${bodyStun}`);
  if (bodyPhys > 0)          lines.push(`Physical ${bodyPhys}`);

  return (
    <div className="flex flex-col gap-0.5">
      <div style={{ color: '#ef4444' }} className="font-bold">
        {ic.type} hits for {netHits} net — damage:
      </div>
      {lines.map((l, i) => (
        <div key={i} style={{ color: '#ef4444' }}>{l}</div>
      ))}
    </div>
  );
}
