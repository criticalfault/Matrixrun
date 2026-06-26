import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunner } from '@/runner/runnerContext';
import { usePoolRoll } from '@/runner/usePoolRoll';
import HackingPoolModal from '@/runner/HackingPoolModal';
import CombatModal from '@/runner/CombatModal';
import type { CombatResult } from '@/runner/CombatModal';
import {
  OPERATION_DEFINITIONS,
  SECURITY_CODE_COLORS,
  IC_DEFINITIONS,
  IC_CATEGORY_COLOR,
  PROGRAM_OP_BONUS,
} from '@/data/srTables';
import { getEffectiveSubsystemRating } from '@/engine/securityEngine';
import { rollDice } from '@/engine/diceEngine';
import type { AlertLevel, LogEntryType, PersonaAttribute, ICInstance, Program } from '@/types';
import { Button } from '@/components/ui/button';

// ─── Alert color helper ───────────────────────────────────────────────────────

function alertColor(level: AlertLevel): string {
  switch (level) {
    case 'passive':  return '#f59e0b';
    case 'active':   return '#ef4444';
    case 'shutdown': return '#a855f7';
    default:         return 'var(--color-muted-foreground)';
  }
}

function alertLabel(level: AlertLevel): string {
  switch (level) {
    case 'passive':  return 'PASSIVE ALERT';
    case 'active':   return 'ACTIVE ALERT';
    case 'shutdown': return 'SHUTDOWN';
    default:         return 'NOMINAL';
  }
}

function logTypeColor(type: LogEntryType): string {
  switch (type) {
    case 'ic-activation': return '#f97316';
    case 'alert':         return '#ef4444';
    case 'navigation':    return '#06b6d4';
    case 'operation':     return 'var(--color-primary)';
    case 'combat':        return '#eab308';
    case 'damage':        return '#ef4444';
    case 'system':        return '#a855f7';
    default:              return 'var(--color-muted-foreground)';
  }
}

// ─── Program bonus helpers ────────────────────────────────────────────────────

function getProgramBonuses(opKey: string, programs: Program[]): Array<{ name: string; rating: number }> {
  const loaded = programs.filter(p => p.loaded);
  const result: Array<{ name: string; rating: number }> = [];
  for (const [progName, ops] of Object.entries(PROGRAM_OP_BONUS)) {
    if (ops.includes(opKey)) {
      const prog = loaded.find(p => p.name.toLowerCase().includes(progName.toLowerCase()));
      if (prog) result.push({ name: prog.name, rating: prog.rating });
    }
  }
  return result;
}

function getSleazeProgram(programs: Program[]): Program | undefined {
  return programs.filter(p => p.loaded).find(p => p.name.toLowerCase().includes('sleaze'));
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function HostDashboard() {
  const navigate = useNavigate();
  const { session, dispatch, hackingPoolAvailable, host, addLog, detectionFactorPenalty } = useRunner();
  const { pendingRoll, requestRoll } = usePoolRoll();

  const ops = OPERATION_DEFINITIONS;

  const SHOWN_OPS = [
    'Access', 'LocateFile', 'ReadFile', 'EditFile',
    'LocatePaydata', 'DownloadFile', 'ControlSlave',
    'AnalyzeIC', 'CrashIC', 'DumpLog',
  ];

  async function handleOperation(opKey: string) {
    if (!host) return;
    const op = ops[opKey];
    if (!op) return;

    const tn = op.subsystem === 'none'
      ? host.securityValue
      : getEffectiveSubsystemRating(host, op.subsystem as Parameters<typeof getEffectiveSubsystemRating>[1], session.alertLevel);

    const bonuses = getProgramBonuses(opKey, session.loadedPrograms);
    const bonusDice = bonuses.reduce((s, b) => s + b.rating, 0);
    const bonusLabel = bonuses.length > 0
      ? ` (${bonuses.map(b => `${b.name} +${b.rating}`).join(', ')})`
      : '';

    const result = await requestRoll({
      label: `${op.label}${bonusLabel} — TN ${tn}`,
      baseDice: session.character.computerSkill + bonusDice,
      targetNumber: tn,
      requiredSuccesses: 1,
      cancelable: true,
    });

    if (!result) return;

    // Sleaze mitigation: if success and there's a tally cost, roll Sleaze to reduce it
    let tally = result.success ? op.tallyOnSuccess : op.tallyOnFailure;
    let sleazeNote = '';
    if (result.success && op.tallyOnSuccess > 0) {
      const sleaze = getSleazeProgram(session.loadedPrograms);
      if (sleaze) {
        const sleazeRoll = rollDice(sleaze.rating, host.securityValue, `Sleaze (${sleaze.name} ${sleaze.rating})`);
        const reduction = sleazeRoll.successes;
        tally = Math.max(0, tally - reduction);
        sleazeNote = ` | Sleaze: ${sleazeRoll.successes} successes → tally reduced by ${reduction}`;
        if (reduction > 0 && tally === 0) sleazeNote += ' (fully mitigated)';
      }
    }

    if (tally > 0) dispatch({ type: 'ADD_TALLY', payload: tally });

    addLog(
      'operation',
      `${op.label}: ${result.success ? 'SUCCESS' : 'FAILURE'}`,
      `${result.narrative}${tally > 0 ? ` (+${tally} tally)` : ''}${sleazeNote}`,
      result.rolls,
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-mono bg-[var(--color-background)]">
      {/* Top bar */}
      <TopBar
        session={session}
        host={host}
        hackingPoolAvailable={hackingPoolAvailable}
        onEndTurn={() => {
          dispatch({ type: 'END_COMBAT_TURN' });
          if (session.shutdownCountdown !== undefined) dispatch({ type: 'TICK_SHUTDOWN' });
          addLog('system', `Combat Turn ${session.combatTurn} ended`, 'Hacking pool refreshed.');
        }}
        onDisconnect={() => navigate('/runner')}
      />

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT */}
        <LeftColumn
          session={session}
          dispatch={dispatch}
          addLog={addLog}
          hackingPoolAvailable={hackingPoolAvailable}
        />

        {/* CENTER */}
        <div className="flex-1 flex flex-col overflow-y-auto p-3 gap-3 border-r border-[var(--color-border)]">
          {host ? (
            <>
              <HostInfoCard host={host} alertLevel={session.alertLevel} />
              <ActiveICPanel
                session={session}
                dispatch={dispatch}
                addLog={addLog}
              />
              <OperationsPanel
                opKeys={SHOWN_OPS}
                onRun={handleOperation}
                host={host}
                alertLevel={session.alertLevel}
                programs={session.loadedPrograms}
              />
            </>
          ) : (
            <div className="text-xs text-[var(--color-muted-foreground)] p-4">No host loaded.</div>
          )}
        </div>

        {/* RIGHT */}
        <RightColumn
          session={session}
          host={host}
          dispatch={dispatch}
          addLog={addLog}
          detectionFactorPenalty={detectionFactorPenalty}
        />
      </div>

      {/* Hacking Pool Modal */}
      {pendingRoll && <HackingPoolModal request={pendingRoll} />}
    </div>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({ session, host, hackingPoolAvailable, onEndTurn, onDisconnect }: {
  session: import('@/types').RunnerSession;
  host: import('@/types').Host | undefined;
  hackingPoolAvailable: number;
  onEndTurn: () => void;
  onDisconnect: () => void;
}) {
  const al = session.alertLevel;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-b text-[11px] flex-shrink-0"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)', height: 40 }}
    >
      {/* Host name + security code */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold text-[var(--color-foreground)] truncate">
          {host?.name ?? 'NO HOST'}
        </span>
        {host && (
          <span
            className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold tracking-widest flex-shrink-0"
            style={{
              color: SECURITY_CODE_COLORS[host.securityCode],
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: SECURITY_CODE_COLORS[host.securityCode],
              backgroundColor: `${SECURITY_CODE_COLORS[host.securityCode]}18`,
            }}
          >
            {host.securityCode.toUpperCase()}
          </span>
        )}
      </div>

      <div className="w-px h-4 bg-[var(--color-border)]" />

      {/* Alert */}
      <span
        className="font-bold tracking-wider flex-shrink-0"
        style={{ color: alertColor(al) }}
      >
        {alertLabel(al)}
      </span>

      <div className="w-px h-4 bg-[var(--color-border)]" />

      {/* Tally */}
      <span className="text-[var(--color-muted-foreground)]">
        TALLY: <span className="text-[var(--color-foreground)] font-bold">{session.securityTally}</span>
      </span>

      {/* Shutdown countdown */}
      {session.shutdownCountdown !== undefined && (
        <>
          <div className="w-px h-4 bg-[var(--color-border)]" />
          <span
            className="font-bold tracking-wider animate-pulse flex-shrink-0"
            style={{ color: '#a855f7' }}
          >
            SHUTDOWN: {session.shutdownCountdown} turns
          </span>
        </>
      )}

      <div className="w-px h-4 bg-[var(--color-border)]" />

      {/* Pool */}
      <span className="text-[var(--color-muted-foreground)] flex-shrink-0">
        POOL: <span className="font-bold" style={{ color: 'var(--color-primary)' }}>{hackingPoolAvailable}</span>
        <span>/{session.hackingPoolTotal}</span>
      </span>

      {/* Turn counter */}
      <span className="text-[var(--color-muted-foreground)] flex-shrink-0">
        TURN <span className="text-[var(--color-foreground)]">{session.combatTurn}</span>
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <Button
        size="sm"
        variant="outline"
        onClick={onEndTurn}
        className="text-[10px] h-6 px-2 flex-shrink-0"
      >
        [ END TURN ]
      </Button>
      <button
        onClick={onDisconnect}
        className="text-[10px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors flex-shrink-0"
      >
        ← Disconnect
      </button>
    </div>
  );
}

// ─── Left Column ──────────────────────────────────────────────────────────────

function LeftColumn({ session, dispatch, addLog, hackingPoolAvailable }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
  hackingPoolAvailable: number;
}) {
  return (
    <div
      className="flex flex-col gap-2 overflow-y-auto p-2 border-r border-[var(--color-border)]"
      style={{ width: 220, flexShrink: 0 }}
    >
      <PersonaPanel session={session} dispatch={dispatch} addLog={addLog} />
      <DamagePanel session={session} dispatch={dispatch} addLog={addLog} />
      <HackingPoolPanel session={session} dispatch={dispatch} />
      <ProgramsPanel session={session} />
    </div>
  );
}

// ─── Persona Panel ────────────────────────────────────────────────────────────

function PersonaPanel({ session, dispatch, addLog }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [attr, setAttr] = useState<PersonaAttribute>('Bod');
  const [amount, setAmount] = useState(1);

  const deck = session.character.deck;
  const pc = session.personaCondition;

  const attrs: Array<{ key: keyof typeof pc; label: string; base: number }> = [
    { key: 'bod',     label: 'BOD',     base: deck.bod },
    { key: 'evasion', label: 'EVASION', base: deck.evasion },
    { key: 'sensors', label: 'SENSORS', base: deck.sensors },
    { key: 'masking', label: 'MASKING', base: deck.masking },
  ];

  function applyDamage() {
    const payload: Partial<import('@/types').PersonaCondition> = {};
    switch (attr) {
      case 'Bod':     payload.bod     = amount; break;
      case 'Evasion': payload.evasion = amount; break;
      case 'Sensors': payload.sensors = amount; break;
      case 'Masking': payload.masking = amount; break;
    }
    dispatch({ type: 'DAMAGE_PERSONA', payload });
    addLog('damage', `Persona ${attr} damaged`, `${attr} -${amount}`);
    setShowForm(false);
    setAmount(1);
  }

  return (
    <PanelCard title="PERSONA" subtitle={deck.name}>
      <div className="flex flex-col gap-1">
        {attrs.map(({ key, label, base }) => {
          const dmg = pc[key];
          const eff = Math.max(0, base - dmg);
          const hasDmg = dmg > 0;
          return (
            <div key={key} className="flex flex-col gap-0.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-[var(--color-muted-foreground)] w-16">{label}</span>
                <span style={{ color: hasDmg ? '#ef4444' : 'var(--color-foreground)' }}>
                  {base} - {dmg} = <span className="font-bold">{eff}</span>
                </span>
              </div>
              {/* Damage track */}
              <div className="flex gap-0.5">
                {Array.from({ length: base }).map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 flex-1 border"
                    style={{
                      borderColor: i < dmg ? '#ef4444' : 'var(--color-border)',
                      backgroundColor: i < dmg ? '#ef444466' : 'transparent',
                    }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => setShowForm(!showForm)}
        className="mt-2 text-[9px] tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] border border-[var(--color-border)] px-2 py-1 w-full transition-colors"
      >
        {showForm ? '↑ Cancel' : '+ Take Damage'}
      </button>

      {showForm && (
        <div className="mt-2 flex flex-col gap-2 border border-[var(--color-border)] p-2">
          <select
            value={attr}
            onChange={(e) => setAttr(e.target.value as PersonaAttribute)}
            className="text-[10px] bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-foreground)] px-1 py-0.5"
          >
            <option value="Bod">Bod</option>
            <option value="Evasion">Evasion</option>
            <option value="Sensors">Sensors</option>
            <option value="Masking">Masking</option>
          </select>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              max={10}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-12 text-[10px] bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-foreground)] px-1 py-0.5"
            />
            <button
              onClick={applyDamage}
              className="flex-1 text-[9px] tracking-wider border border-[var(--color-primary)] text-[var(--color-primary)] px-2 py-1 hover:bg-[var(--color-primary)]/10 transition-colors"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </PanelCard>
  );
}

// ─── Damage Panel ─────────────────────────────────────────────────────────────

function DamagePanel({ session, dispatch, addLog }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
}) {
  const TRACK = 10;

  function addStun() {
    dispatch({ type: 'TAKE_STUN', payload: 1 });
    addLog('damage', 'Stun damage taken', 'Stun +1');
  }
  function addPhys() {
    dispatch({ type: 'TAKE_PHYS', payload: 1 });
    addLog('damage', 'Physical damage taken', 'Physical +1');
  }

  return (
    <PanelCard title="CONDITION">
      <TrackRow label="STUN" filled={session.stunDamage} total={TRACK} color="#eab308" />
      <TrackRow label="PHYS" filled={session.physDamage} total={TRACK} color="#ef4444" />
      <div className="flex gap-1 mt-2">
        <button
          onClick={addStun}
          className="flex-1 text-[9px] tracking-wider border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:border-[#eab308] hover:text-[#eab308] transition-colors"
        >
          +1 Stun
        </button>
        <button
          onClick={addPhys}
          className="flex-1 text-[9px] tracking-wider border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
        >
          +1 Phys
        </button>
      </div>
    </PanelCard>
  );
}

function TrackRow({ label, filled, total, color }: {
  label: string; filled: number; total: number; color: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[9px]">
        <span className="text-[var(--color-muted-foreground)]">{label}</span>
        <span style={{ color: filled > 0 ? color : 'var(--color-muted-foreground)' }}>{filled}/{total}</span>
      </div>
      <div className="flex gap-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className="h-2 flex-1 border"
            style={{
              borderColor: i < filled ? color : 'var(--color-border)',
              backgroundColor: i < filled ? `${color}66` : 'transparent',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Hacking Pool Panel ───────────────────────────────────────────────────────

function HackingPoolPanel({ session, dispatch }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
}) {
  const opsAvailable = session.hackingPoolTotal - session.hackingPoolUsed - session.suppressionPool;

  return (
    <PanelCard title="HACKING POOL">
      {/* Circle display */}
      <div className="flex items-center justify-center py-1">
        <div
          className="w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center"
          style={{ borderColor: 'var(--color-primary)' }}
        >
          <span className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>{session.hackingPoolTotal}</span>
          <span className="text-[8px] text-[var(--color-muted-foreground)]">TOTAL</span>
        </div>
      </div>

      {/* Pool breakdown */}
      <div className="flex justify-between text-[9px] mt-1">
        <span className="text-[var(--color-muted-foreground)]">OPS avail</span>
        <span style={{ color: 'var(--color-primary)' }} className="font-bold">{opsAvailable}</span>
      </div>
      {session.suppressionPool > 0 && (
        <div className="flex justify-between text-[9px]">
          <span className="text-[var(--color-muted-foreground)]">SUPPRESS reserved</span>
          <span style={{ color: '#f59e0b' }} className="font-bold">{session.suppressionPool}</span>
        </div>
      )}
      {session.hackingPoolUsed > 0 && (
        <div className="flex justify-between text-[9px]">
          <span className="text-[var(--color-muted-foreground)]">Used this turn</span>
          <span style={{ color: 'var(--color-muted-foreground)' }}>{session.hackingPoolUsed}</span>
        </div>
      )}

      {/* Suppression Reserve slider */}
      <div className="mt-2 border-t border-[var(--color-border)] pt-2">
        <div className="text-[9px] tracking-wider text-[var(--color-muted-foreground)] mb-1">SUPPRESSION RESERVE</div>
        <input
          type="range"
          min={0}
          max={session.hackingPoolTotal - session.hackingPoolUsed}
          value={session.suppressionPool}
          onChange={(e) => dispatch({ type: 'SET_SUPPRESSION_POOL', payload: Number(e.target.value) })}
          className="w-full accent-[#f59e0b]"
        />
        <div className="flex justify-between text-[9px] text-[var(--color-muted-foreground)]">
          <span>0</span>
          <span>{session.hackingPoolTotal - session.hackingPoolUsed}</span>
        </div>
        {session.suppressionPool > 0 ? (
          <div className="text-[9px] mt-0.5" style={{ color: '#f59e0b' }}>
            {session.suppressionPool} dice auto-defend vs IC
          </div>
        ) : (
          <div className="text-[9px] mt-0.5 text-[var(--color-muted-foreground)] italic">
            No suppression reserve
          </div>
        )}
      </div>

      <div className="text-center text-[9px] text-[var(--color-muted-foreground)] mt-1">
        TURN <span className="text-[var(--color-foreground)]">{session.combatTurn}</span>
      </div>
      <button
        onClick={() => dispatch({ type: 'END_COMBAT_TURN' })}
        className="mt-2 w-full text-[9px] tracking-wider border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
      >
        End Combat Turn
      </button>
    </PanelCard>
  );
}

// ─── Center: Host Info Card ───────────────────────────────────────────────────

function HostInfoCard({ host, alertLevel }: {
  host: import('@/types').Host;
  alertLevel: AlertLevel;
}) {
  const subsystems: Array<{ key: Parameters<typeof getEffectiveSubsystemRating>[1]; label: string }> = [
    { key: 'access',  label: 'Access' },
    { key: 'files',   label: 'Files' },
    { key: 'slave',   label: 'Slave' },
    { key: 'index',   label: 'Index' },
    { key: 'control', label: 'Control' },
  ];

  const alertMod = alertLevel !== 'none' ? 2 : 0;
  const codeColor = SECURITY_CODE_COLORS[host.securityCode];

  return (
    <PanelCard title="CURRENT HOST">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-bold text-xs text-[var(--color-foreground)]">{host.name}</div>
          {host.description && (
            <div className="text-[9px] text-[var(--color-muted-foreground)] mt-0.5 line-clamp-2">{host.description}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span
            className="text-[9px] px-1.5 py-0.5 font-bold tracking-widest border"
            style={{ color: codeColor, borderColor: codeColor, backgroundColor: `${codeColor}18` }}
          >
            {host.securityCode}
          </span>
          <span className="text-[9px] text-[var(--color-muted-foreground)]">SV {host.securityValue}</span>
        </div>
      </div>

      {/* Subsystems table */}
      <table className="w-full text-[10px]">
        <thead>
          <tr className="text-[var(--color-muted-foreground)]">
            <th className="text-left font-normal pb-1">Subsystem</th>
            <th className="text-right font-normal pb-1">Base</th>
            <th className="text-right font-normal pb-1">Eff.</th>
          </tr>
        </thead>
        <tbody>
          {subsystems.map(({ key, label }) => {
            const base = host.subsystems[key];
            const eff = getEffectiveSubsystemRating(host, key, alertLevel);
            return (
              <tr key={key}>
                <td className="py-0.5 text-[var(--color-muted-foreground)]">{label}</td>
                <td className="text-right">{base}</td>
                <td className="text-right font-bold" style={{ color: alertMod > 0 ? '#f59e0b' : 'var(--color-foreground)' }}>
                  {eff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {alertMod > 0 && (
        <div className="mt-1 text-[9px]" style={{ color: '#f59e0b' }}>
          +{alertMod} alert modifier active
        </div>
      )}
    </PanelCard>
  );
}

// ─── Active IC Panel ──────────────────────────────────────────────────────────

function ActiveICPanel({ session, dispatch, addLog }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
}) {
  const { hackingPoolAvailable } = useRunner();
  const [combatTarget, setCombatTarget] = useState<ICInstance | null>(null);
  const [attackProgram, setAttackProgram] = useState<Program | null>(null);
  const [programPickerIC, setProgramPickerIC] = useState<ICInstance | null>(null);
  const [noAttackError, setNoAttackError] = useState<string | null>(null);

  function crashIC(icId: string, suppress: boolean) {
    const ic = session.activeIC.find(i => i.id === icId);
    if (!ic) return;
    dispatch({ type: 'CRASH_IC', payload: { icId, suppress } });
    if (suppress) {
      addLog('combat', `IC Suppressed: ${ic.type}-${ic.rating}`, 'IC removed without tally cost. Detection factor increased.');
    } else {
      addLog('combat', `IC Crashed: ${ic.type}-${ic.rating}`, `+${ic.rating} security tally`);
    }
  }

  function openCombat(ic: ICInstance) {
    setNoAttackError(null);
    const attackProgs = session.loadedPrograms.filter(
      p => p.name.toLowerCase().includes('attack') && p.loaded,
    );
    if (attackProgs.length === 0) {
      setNoAttackError('No Attack program loaded');
      return;
    }
    if (attackProgs.length === 1) {
      setAttackProgram(attackProgs[0]);
      setCombatTarget(ic);
    } else {
      setProgramPickerIC(ic);
    }
  }

  function handleCombatResult(result: CombatResult) {
    if (!combatTarget) return;

    const newRating = combatTarget.currentRating - result.icDamage;

    if (result.icDamage > 0 && !result.icCrashed) {
      dispatch({ type: 'UPDATE_IC_RATING', payload: { icId: combatTarget.id, newRating } });
    }

    if (result.icCrashed) {
      // inline confirm: dispatch handled in crash buttons rendered below
      // For now open a quick crash dialog
      setCombatTarget(null);
      // We'll use a separate state for crash confirm
      setPendingCrashIC(combatTarget);
    } else {
      setCombatTarget(null);
    }

    if (Object.keys(result.personaDamage).length > 0) {
      dispatch({ type: 'DAMAGE_PERSONA', payload: result.personaDamage });
    }
    if (result.bodyStun > 0) dispatch({ type: 'TAKE_STUN', payload: result.bodyStun });
    if (result.bodyPhys > 0) dispatch({ type: 'TAKE_PHYS', payload: result.bodyPhys });

    addLog('combat', `Cybercombat vs ${combatTarget.type}-${combatTarget.rating}`, result.log);
  }

  const [pendingCrashIC, setPendingCrashIC] = useState<ICInstance | null>(null);

  return (
    <>
    <PanelCard title="ACTIVE IC">
      {noAttackError && (
        <div className="text-[9px] mb-1" style={{ color: '#ef4444' }}>{noAttackError}</div>
      )}
      {session.activeIC.length === 0 ? (
        <div className="text-[10px] text-[var(--color-muted-foreground)] py-2">No active IC</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {session.activeIC.map((ic) => {
            const def = IC_DEFINITIONS[ic.type];
            const catColor = IC_CATEGORY_COLOR[ic.category];
            return (
              <div
                key={ic.id}
                className="flex flex-col gap-1 border p-2 text-[10px]"
                style={{ borderColor: `${catColor}44` }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: catColor }} />
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-[var(--color-foreground)]">{def?.label ?? ic.type}</span>
                    <span className="text-[var(--color-muted-foreground)] ml-1">-{ic.rating}</span>
                    {ic.currentRating !== ic.rating && (
                      <span style={{ color: 'var(--color-primary)' }} className="ml-1">
                        (cur {ic.currentRating})
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openCombat(ic)}
                    className="flex-1 text-[9px] border px-1.5 py-0.5 hover:bg-[var(--color-primary)]/10 transition-colors font-bold"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    Combat
                  </button>
                  <button
                    onClick={() => crashIC(ic.id, false)}
                    className="text-[9px] border border-[#ef4444] text-[#ef4444] px-1.5 py-0.5 hover:bg-[#ef4444]/10 transition-colors"
                  >
                    Crash
                  </button>
                  <button
                    onClick={() => crashIC(ic.id, true)}
                    className="text-[9px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-1.5 py-0.5 hover:border-[#f59e0b] hover:text-[#f59e0b] transition-colors"
                  >
                    Suppress
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {(session.suppressedIC ?? []).length > 0 && (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2">
          <div className="text-[9px] text-[var(--color-muted-foreground)] mb-1">SUPPRESSED IC</div>
          {(session.suppressedIC ?? []).map((ic) => (
            <div key={ic.id} className="text-[9px] text-[var(--color-muted-foreground)] opacity-60">
              {ic.type}-{ic.rating}
            </div>
          ))}
          <div className="text-[9px] mt-1" style={{ color: '#f59e0b' }}>
            Detection Factor -{(session.suppressedIC ?? []).length}
          </div>
        </div>
      )}
    </PanelCard>

    {/* Program picker for multiple attack programs */}
    {programPickerIC && (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      >
        <div
          className="border p-4 font-mono text-[11px] flex flex-col gap-3"
          style={{
            borderColor: 'var(--color-primary)',
            backgroundColor: 'var(--color-card)',
            minWidth: 280,
          }}
        >
          <div className="text-[var(--color-primary)] font-bold tracking-widest">SELECT ATTACK PROGRAM</div>
          {session.loadedPrograms
            .filter(p => p.name.toLowerCase().includes('attack') && p.loaded)
            .map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setAttackProgram(p);
                  setCombatTarget(programPickerIC);
                  setProgramPickerIC(null);
                }}
                className="border px-3 py-1.5 text-left hover:bg-[var(--color-primary)]/10 transition-colors"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                {p.name} (Rating {p.rating})
              </button>
            ))}
          <button
            onClick={() => setProgramPickerIC(null)}
            className="text-[9px] text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-2 py-1 hover:text-[var(--color-foreground)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    )}

    {/* Crash confirm after combat */}
    {pendingCrashIC && (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
      >
        <div
          className="border p-4 font-mono text-[11px] flex flex-col gap-3"
          style={{
            borderColor: '#ef4444',
            backgroundColor: 'var(--color-card)',
            minWidth: 300,
          }}
        >
          <div className="font-bold tracking-widest" style={{ color: '#ef4444' }}>
            IC CRASHED: {pendingCrashIC.type}-{pendingCrashIC.rating}
          </div>
          <div className="text-[var(--color-muted-foreground)]">Crash for tally, or suppress silently?</div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                crashIC(pendingCrashIC.id, false);
                setPendingCrashIC(null);
              }}
              className="flex-1 border py-1.5 font-bold text-[10px] hover:bg-[#ef4444]/10 transition-colors"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              Crash (+{pendingCrashIC.rating} tally)
            </button>
            <button
              onClick={() => {
                crashIC(pendingCrashIC.id, true);
                setPendingCrashIC(null);
              }}
              className="flex-1 border py-1.5 font-bold text-[10px] hover:bg-[#f59e0b]/10 transition-colors"
              style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
            >
              Suppress (-1 DF)
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Combat Modal */}
    {combatTarget && attackProgram && (
      <CombatModal
        ic={combatTarget}
        attackProgram={attackProgram}
        character={session.character}
        session={session}
        hackingPoolAvailable={hackingPoolAvailable}
        suppressionPool={session.suppressionPool}
        onClose={() => { setCombatTarget(null); setAttackProgram(null); }}
        onResult={handleCombatResult}
      />
    )}
    </>
  );
}

// ─── Operations Panel ─────────────────────────────────────────────────────────

function OperationsPanel({ opKeys, onRun, host, alertLevel, programs }: {
  opKeys: string[];
  onRun: (key: string) => void;
  host: import('@/types').Host;
  alertLevel: AlertLevel;
  programs: Program[];
}) {
  return (
    <PanelCard title="OPERATIONS">
      <div className="grid grid-cols-2 gap-1.5">
        {opKeys.map((key) => {
          const op = OPERATION_DEFINITIONS[key];
          if (!op) return null;

          const tn = op.subsystem === 'none'
            ? host.securityValue
            : getEffectiveSubsystemRating(host, op.subsystem as Parameters<typeof getEffectiveSubsystemRating>[1], alertLevel);

          const bonuses = getProgramBonuses(key, programs);

          return (
            <button
              key={key}
              onClick={() => onRun(key)}
              className="text-left border border-[var(--color-border)] p-2 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
            >
              <div className="text-[10px] font-bold text-[var(--color-foreground)] leading-tight">{op.label}</div>
              <div className="text-[9px] text-[var(--color-muted-foreground)] mt-0.5">
                TN {tn}
                {op.tallyOnFailure > 0 && (
                  <span className="text-[#ef4444]/70"> / Fail +{op.tallyOnFailure}</span>
                )}
                {op.tallyOnSuccess > 0 && (
                  <span className="text-[#f59e0b]/70"> / OK +{op.tallyOnSuccess}</span>
                )}
              </div>
              {bonuses.length > 0 && (
                <div className="text-[8px] mt-0.5" style={{ color: '#4ade8088' }}>
                  {bonuses.map(b => `+${b.rating} ${b.name}`).join(', ')}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </PanelCard>
  );
}

// ─── Right Column ─────────────────────────────────────────────────────────────

function RightColumn({ session, host, dispatch, addLog, detectionFactorPenalty }: {
  session: import('@/types').RunnerSession;
  host: import('@/types').Host | undefined;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
  detectionFactorPenalty: number;
}) {
  const logRef = useRef<HTMLDivElement>(null);

  // Scroll to top when new entries come in (newest-first is just reversed slice)
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [session.log.length]);

  const reversedLog = [...session.log].reverse();

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ width: 280, flexShrink: 0 }}
    >
      {/* Log */}
      <div className="flex flex-col flex-1 overflow-hidden p-2">
        <div className="text-[9px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-2 px-1">
          Matrix Log
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
          {reversedLog.length === 0 ? (
            <div className="text-[9px] text-[var(--color-muted-foreground)] px-1">No events logged</div>
          ) : (
            reversedLog.map((entry) => (
              <div
                key={entry.id}
                className="border-l-2 pl-2 py-0.5"
                style={{ borderLeftColor: logTypeColor(entry.type) }}
              >
                <div className="flex items-center gap-1">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: logTypeColor(entry.type) }}
                  />
                  <span className="text-[9px] text-[var(--color-muted-foreground)]">T{entry.id.slice(0, 4)}</span>
                </div>
                <div className="text-[10px] font-bold text-[var(--color-foreground)] leading-tight">{entry.title}</div>
                {entry.details && (
                  <div className="text-[9px] text-[var(--color-muted-foreground)] leading-tight mt-0.5">{entry.details}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Navigation */}
      <NavigationPanel
        session={session}
        host={host}
        dispatch={dispatch}
        addLog={addLog}
      />
    </div>
  );
}

// ─── Navigation Panel ─────────────────────────────────────────────────────────

function NavigationPanel({ session, host, dispatch, addLog }: {
  session: import('@/types').RunnerSession;
  host: import('@/types').Host | undefined;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
}) {
  if (!host) return null;

  const nextHosts = host.nextHostIds.map(
    (id) => session.runPacket.hosts.find((h) => h.id === id)
  ).filter(Boolean) as import('@/types').Host[];

  return (
    <div className="border-t border-[var(--color-border)] p-2">
      <div className="text-[9px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-2">
        Navigation
      </div>
      {nextHosts.length === 0 ? (
        <div className="text-[9px] font-bold tracking-wider" style={{ color: '#22c55e' }}>
          RUN COMPLETE — All objectives achieved
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {nextHosts.map((nh) => (
            <button
              key={nh.id}
              onClick={() => {
                dispatch({ type: 'ADVANCE_HOST', payload: nh.id });
                addLog('navigation', `Navigating to ${nh.name}`, `Security code: ${nh.securityCode}`);
              }}
              className="text-left border border-[var(--color-border)] p-2 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all"
            >
              <div className="text-[10px] font-bold flex items-center gap-1.5">
                <span style={{ color: SECURITY_CODE_COLORS[nh.securityCode] }}>●</span>
                <span className="text-[var(--color-foreground)]">→ {nh.name}</span>
              </div>
              <div className="text-[9px] text-[var(--color-muted-foreground)] mt-0.5 pl-4">
                {nh.securityCode} / SV {nh.securityValue}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Programs Panel ───────────────────────────────────────────────────────────

function ProgramsPanel({ session }: {
  session: import('@/types').RunnerSession;
}) {
  const loaded = session.loadedPrograms.filter(p => p.loaded);
  const totalMp = loaded.reduce((sum, p) => sum + p.sizeMp, 0);
  const maxMp = session.character.deck.activeMemoryMp;

  return (
    <PanelCard title="PROGRAMS">
      <div className="flex justify-between text-[9px] text-[var(--color-muted-foreground)] mb-1">
        <span>Memory</span>
        <span>{totalMp}/{maxMp} Mp</span>
      </div>
      {loaded.length === 0 ? (
        <div className="text-[9px] text-[var(--color-muted-foreground)]">No programs loaded</div>
      ) : (
        <div className="flex flex-col gap-1">
          {loaded.map((p) => {
            const isAttack = p.name.toLowerCase().includes('attack');
            const isSleaze = p.name.toLowerCase().includes('sleaze');
            const isArmor = p.name.toLowerCase().includes('armor');

            // Find which ops this program boosts
            const boostedOps: string[] = [];
            for (const [progName, ops] of Object.entries(PROGRAM_OP_BONUS)) {
              if (p.name.toLowerCase().includes(progName.toLowerCase())) {
                boostedOps.push(...ops.map(op => OPERATION_DEFINITIONS[op]?.label ?? op));
              }
            }

            return (
              <div key={p.name} className="flex flex-col gap-0.5">
                <div className="flex justify-between text-[9px]">
                  <span style={{ color: isAttack ? 'var(--color-primary)' : isSleaze ? '#a855f7' : isArmor ? '#22c55e' : 'var(--color-foreground)' }}>
                    {p.name}
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">{p.rating}</span>
                </div>
                {boostedOps.length > 0 && (
                  <div className="text-[8px] pl-1" style={{ color: '#4ade8066' }}>
                    +{p.rating}: {boostedOps.slice(0, 3).join(', ')}{boostedOps.length > 3 ? '…' : ''}
                  </div>
                )}
                {isSleaze && (
                  <div className="text-[8px] pl-1" style={{ color: '#a855f766' }}>
                    Tally mitigation on success
                  </div>
                )}
                {isArmor && (
                  <div className="text-[8px] pl-1" style={{ color: '#22c55e66' }}>
                    Passive: +{p.rating} Bod resistance
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PanelCard>
  );
}

// ─── Shared PanelCard ─────────────────────────────────────────────────────────

function PanelCard({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-[var(--color-border)] p-2 bg-[var(--color-card)]">
      <div className="flex items-baseline gap-2 mb-2">
        <div className="text-[9px] tracking-widest uppercase text-[var(--color-muted-foreground)]">{title}</div>
        {subtitle && (
          <div className="text-[9px] text-[var(--color-foreground)] opacity-60 truncate">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}
