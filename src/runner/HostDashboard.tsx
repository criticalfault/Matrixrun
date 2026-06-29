import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunner } from '@/runner/runnerContext';
import { usePoolRoll } from '@/runner/usePoolRoll';
import HackingPoolModal from '@/runner/HackingPoolModal';
import CombatModal from '@/runner/CombatModal';
import RunnerTopologyMap from '@/runner/RunnerTopologyMap';
import { LocateSearchModal } from '@/runner/LocateSearchModal';
import { NoticingICModal } from '@/runner/NoticingICModal';
import type { CombatResult } from '@/runner/CombatModal';
import type { LocateSearchResult } from '@/runner/LocateSearchModal';
import {
  OPERATION_DEFINITIONS,
  SECURITY_CODE_COLORS,
  IC_DEFINITIONS,
  IC_CATEGORY_COLOR,
  PROGRAM_OP_BONUS,
} from '@/data/srTables';
import { getEffectiveSubsystemRating } from '@/engine/securityEngine';
import { calcDetectionFactor, getProgramTNReduction, rollHostSecurityTest, checkSheafTriggers } from '@/runner/runnerHelpers';
import { rollDice } from '@/engine/diceEngine';
import type { AlertLevel, LogEntryType, ICInstance, Program, HostFile, PaydataPoint, SecurityCode, Host, DiceRoll } from '@/types';
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

// ─── Dump Shock & Simsense Overload tables ────────────────────────────────────

type DmgLevel = 'L' | 'M' | 'S' | 'D';

// Dump Shock: base damage level from host security code (Power = Security Value)
const DUMP_SHOCK_LEVEL: Record<SecurityCode, DmgLevel> = {
  Blue:   'L',
  Green:  'M',
  Orange: 'S',
  Red:    'D',
  UV:     'D',
};

const DUMP_SHOCK_BOXES: Record<DmgLevel, number> = { L: 1, M: 3, S: 6, D: 10 };

// Simsense Overload: Willpower TN based on staged persona damage level
// Source: Overload Damage Target Numbers table (Matrix3)
const SIMSENSE_OVERLOAD_TN: Record<DmgLevel, number> = { L: 2, M: 3, S: 5, D: 0 };
// Deadly auto-crashes — no Willpower test needed

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function HostDashboard() {
  const navigate = useNavigate();
  const { session, dispatch, hackingPoolAvailable, host, addLog } = useRunner();
  const { pendingRoll, requestRoll } = usePoolRoll();

  const ops = OPERATION_DEFINITIONS;

  // Interrogation fuzzy TN modifier (applies to Locate File/Slave/AccessNode/Paydata)
  const [fuzzyMod, setFuzzyMod] = useState(0);

  // Null Operation inactivity modifier
  const [nullInactivity, setNullInactivity] = useState(0);

  const SHOWN_OPS = [
    // Logon / Access
    'LogonToHost', 'LogonToLTG', 'GracefulLogoff', 'DecryptAccess',
    // Control
    'AnalyzeHost', 'AnalyzeIC', 'AnalyzeIcon', 'AnalyzeSecurity', 'AnalyzeSubsystem', 'NullOperation',
    // Index
    'LocateAccessNode', 'LocateFile', 'LocateIC', 'LocatePaydata', 'LocateSlave', 'LocateDecker',
    // Files
    'DownloadData', 'UploadData', 'EditFile', 'DecryptFile', 'MakeComcall', 'TapComcall',
    // Slave
    'ControlSlave', 'EditSlave', 'MonitorSlave', 'DecryptSlave',
    // Misc
    'SwapMemory',
  ];

  // Dump Shock modal state
  const [dumpShock, setDumpShock] = useState<{ host: Host; afterNav: boolean } | null>(null);

  // Simsense Overload modal state (white/gray IC only)
  const [simsenseOverload, setSimsenseOverload] = useState<{ level: DmgLevel } | null>(null);

  // Analyze Host picker state: null = closed, otherwise the pending choice context
  const [analyzeHostPick, setAnalyzeHostPick] = useState<{
    hostId: string;
    picks: number;         // how many items the decker may choose
    revealAll: boolean;    // 7+ net successes → no picker, reveal everything
  } | null>(null);

  // LocateFile / LocateSlave search modal state
  const [locateSearchMode, setLocateSearchMode] = useState<'file' | 'slave' | null>(null);

  // Action counter — tracks simple actions used this turn (auto-advances turn after 2 simple or 1 complex)
  const [simpleActionsUsed, setSimpleActionsUsed] = useState(0);

  // Noticing IC queue — one modal per newly-triggered IC
  const [noticingICQueue, setNoticingICQueue] = useState<ICInstance[]>([]);

  // IC attack queue — proactive IC that attack when decker uses action elsewhere
  const [icAttackQueue, setIcAttackQueue] = useState<ICInstance[]>([]);

  // Snapshot active proactive IC (before dispatching tally) and queue their attacks
  function queueActiveICAttacks() {
    const attackers = session.activeIC.filter(ic =>
      ic.status === 'active' &&
      (ic.category === 'ProactiveWhite' || ic.category === 'ProactiveGray' || ic.category === 'Black') &&
      (session.evadingIC?.[ic.id] ?? 0) === 0,
    );
    if (attackers.length > 0) setIcAttackQueue(prev => [...prev, ...attackers]);
  }

  function handleLocateSearchResult(result: LocateSearchResult) {
    if (!host || !locateSearchMode) return;
    if (result.locatedIds.length > 0) {
      if (locateSearchMode === 'file') {
        dispatch({ type: 'LOCATE_FILES',  payload: { hostId: host.id, fileIds:  result.locatedIds } });
      } else {
        dispatch({ type: 'LOCATE_SLAVES', payload: { hostId: host.id, slaveIds: result.locatedIds } });
      }
    }
    if (result.tallyChange > 0) dispatch({ type: 'ADD_TALLY', payload: result.tallyChange });
    addLog('operation', result.log, `Keywords search — ${result.locatedIds.length} item(s) found`);
    setLocateSearchMode(null);
  }

  // Applies tally, fires sheaf steps, queues Noticing IC rolls
  function applyTallyAndCheckSheaf(tallyGained: number) {
    if (!host) return;
    if (tallyGained <= 0) return;
    if (session.alertLevel === 'shutdown') {
      dispatch({ type: 'ADD_TALLY', payload: tallyGained });
      return;
    }

    const oldTally = session.securityTally;
    const newTally = oldTally + tallyGained;
    dispatch({ type: 'ADD_TALLY', payload: tallyGained });

    const { ics, alertChange, stepLogs } = checkSheafTriggers(host, oldTally, newTally);

    if (alertChange) {
      dispatch({ type: 'SET_ALERT', payload: alertChange });
    }

    for (const ic of ics) {
      dispatch({ type: 'ACTIVATE_IC', payload: ic });
    }

    if (stepLogs.length > 0) {
      addLog('ic-activation', `Security sheaf triggered (tally ${newTally})`, stepLogs.join('\n'));
    }

    if (ics.length > 0) {
      setNoticingICQueue(prev => [...prev, ...ics]);
    }
  }

  // Advances turn counter based on action type; auto-fires END_COMBAT_TURN as needed
  function consumeAction(opKey: string) {
    const op = ops[opKey];
    if (!op || op.action === 'Free') return;

    if (op.action === 'Complex') {
      dispatch({ type: 'END_COMBAT_TURN' });
      if (session.shutdownCountdown !== undefined) dispatch({ type: 'TICK_SHUTDOWN' });
      setSimpleActionsUsed(0);
      addLog('system', `Turn ${session.combatTurn} ends (complex action)`, `${op.label} consumed the full combat turn.`);
    } else {
      // Simple action
      const next = simpleActionsUsed + 1;
      if (next >= 2) {
        dispatch({ type: 'END_COMBAT_TURN' });
        if (session.shutdownCountdown !== undefined) dispatch({ type: 'TICK_SHUTDOWN' });
        setSimpleActionsUsed(0);
        addLog('system', `Turn ${session.combatTurn} ends (2 simple actions)`, `${op.label} was the second simple action this turn.`);
      } else {
        setSimpleActionsUsed(next);
      }
    }
  }

  async function handleOperation(opKey: string) {
    if (!host) return;

    // LocateFile and LocateSlave use the keyword search modal
    if (opKey === 'LocateFile') { setLocateSearchMode('file');  return; }
    if (opKey === 'LocateSlave') { setLocateSearchMode('slave'); return; }

    const op = ops[opKey];
    if (!op) return;

    // Base TN from subsystem (or SV for 'none')
    const rawTN = op.subsystem === 'none'
      ? host.securityValue
      : getEffectiveSubsystemRating(host, op.subsystem as Parameters<typeof getEffectiveSubsystemRating>[1], session.alertLevel);

    // Apply interrogation fuzzy modifier (+2 vague … -2 very specific) or Null Op inactivity modifier
    const contextMod = op.isInterrogation ? fuzzyMod
      : opKey === 'NullOperation' ? nullInactivity
      : 0;

    // Utility programs reduce TN (minimum 2)
    const { reduction, label: bonusLabel } = getProgramTNReduction(opKey, session.loadedPrograms);

    // Wound modifier from persona condition monitor (+1/+2/+3 TN at Light/Moderate/Serious)
    const pBoxes = session.personaBoxes ?? 0;
    const woundMod = pBoxes >= 7 ? 3 : pBoxes >= 4 ? 2 : pBoxes >= 1 ? 1 : 0;

    const tn = Math.max(2, rawTN + contextMod + woundMod - reduction);

    const rollLabel = bonusLabel && woundMod > 0
      ? `${op.label} — TN ${tn} (${rawTN} - ${reduction} utility, +${woundMod} wound)`
      : bonusLabel
      ? `${op.label} — TN ${tn} (${rawTN} - ${reduction} utility)`
      : woundMod > 0
      ? `${op.label} — TN ${tn} (+${woundMod} wound modifier)`
      : `${op.label} — TN ${tn}`;

    // Decker rolls (base dice = Computer skill, pool added via modal)
    const result = await requestRoll({
      label: rollLabel,
      baseDice: session.character.computerSkill,
      targetNumber: tn,
      requiredSuccesses: 1,
      cancelable: true,
    });

    if (!result) return;

    // Host Security Test (auto-roll) — SV dice vs Detection Factor
    const { hostSuccesses, secRoll } = rollHostSecurityTest(session, host.securityValue);

    // Snapshot active proactive IC before tally dispatch (state is still pre-dispatch here)
    queueActiveICAttacks();

    // Apply tally + check sheaf (fires IC and alerts automatically)
    applyTallyAndCheckSheaf(hostSuccesses);

    const netSuccesses = result.netSuccesses - hostSuccesses;
    const opSuccess = netSuccesses >= 1 && !result.isCatastrophic;

    const tallyNote = hostSuccesses > 0
      ? ` | Host: ${hostSuccesses} successes → +${hostSuccesses} tally`
      : ' | Host: no successes';

    addLog(
      'operation',
      `${op.label}: ${opSuccess ? 'SUCCESS' : 'FAILURE'}`,
      `Decker: ${result.netSuccesses} hits, TN ${tn}${tallyNote}`,
      [...(result.rolls ?? []), secRoll],
    );

    // ── Post-roll effects ─────────────────────────────────────────────────────

    if (opSuccess && opKey === 'GracefulLogoff') {
      dispatch({ type: 'SET_SAFEJACK' });
      addLog('operation', 'Graceful Logoff complete', 'Safe disconnect achieved — no dump shock on exit.');
    }

    if (opSuccess && opKey === 'LocateAccessNode') {
      // Reveal all next hosts from this node
      const nextIds = host.nextHostIds;
      if (nextIds.length > 0) {
        dispatch({ type: 'DISCOVER_NEXT_HOSTS', payload: { hostId: host.id, nextIds } });
        const names = nextIds.map(id => session.runPacket.hosts.find(h => h.id === id)?.name ?? id).join(', ');
        addLog('operation', 'Access nodes located', `${nextIds.length} node(s) found: ${names}`);
      } else {
        addLog('operation', 'Access nodes located', 'No further nodes in this host.');
      }
    }

    if (opSuccess) {
      if (opKey === 'AnalyzeSecurity') {
        // Reveals Security Code + Value + alert status (no choice required)
        dispatch({ type: 'REVEAL_HOST_INFO', payload: { hostId: host.id, securityRating: true } });
        addLog('operation', 'Security profile acquired', `Security Code, Security Value, current tally and alert status revealed.`);
      }

      if (opKey === 'AnalyzeHost') {
        if (netSuccesses >= 7) {
          // 7+ successes: reveal everything at once
          dispatch({
            type: 'REVEAL_HOST_INFO',
            payload: {
              hostId: host.id,
              securityRating: true,
              subsystems: { access: true, files: true, slave: true, index: true, control: true },
            },
          });
          addLog('operation', 'Full host profile acquired', `${netSuccesses} net successes — all host data revealed.`);
        } else {
          // 1–6 successes: decker picks what to learn
          setAnalyzeHostPick({ hostId: host.id, picks: netSuccesses, revealAll: false });
        }
      }
    }

    // Advance action/turn counter after any completed operation
    consumeAction(opKey);
  }

  return (
    <div className="min-h-screen flex flex-col font-mono bg-[var(--color-background)]">
      {/* Top bar */}
      <TopBar
        session={session}
        host={host}
        hackingPoolAvailable={hackingPoolAvailable}
        simpleActionsUsed={simpleActionsUsed}
        onEndTurn={() => {
          dispatch({ type: 'END_COMBAT_TURN' });
          if (session.shutdownCountdown !== undefined) dispatch({ type: 'TICK_SHUTDOWN' });
          setSimpleActionsUsed(0);
          addLog('system', `Combat Turn ${session.combatTurn} ended`, 'Hacking pool refreshed.');
        }}
        onDisconnect={() => {
          if (session.isLoggedIn && !session.safejack && host) {
            setDumpShock({ host, afterNav: true });
          } else {
            navigate('/runner');
          }
        }}
      />

      {/* Three-column body */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT */}
        <LeftColumn
          session={session}
          dispatch={dispatch}
          addLog={addLog}
        />

        {/* CENTER */}
        <div className="flex-1 flex flex-col overflow-y-auto p-3 gap-3 border-r border-[var(--color-border)]">
          {/* Topology map — always visible at top */}
          <RunnerTopologyMap
            session={session}
            dispatch={dispatch}
            addLog={addLog}
          />
          {host ? (
            <>
              <HostInfoCard
                host={host}
                alertLevel={session.alertLevel}
                knowledge={session.knownHosts?.[host.id]}
              />
              <FilesPanel
                host={host}
                onOpenLocateSearch={setLocateSearchMode}
                onTallyGained={applyTallyAndCheckSheaf}
                onOperationComplete={queueActiveICAttacks}
              />
              <ActiveICPanel
                session={session}
                dispatch={dispatch}
                addLog={addLog}
                onDumpShock={(h) => setDumpShock({ host: h, afterNav: true })}
                onSimsenseOverload={(level) => setSimsenseOverload({ level })}
              />
              <OperationsPanel
                opKeys={SHOWN_OPS}
                onRun={handleOperation}
                host={host}
                alertLevel={session.alertLevel}
                programs={session.loadedPrograms}
                knowledge={session.knownHosts?.[host.id]}
                fuzzyMod={fuzzyMod}
                onFuzzyMod={setFuzzyMod}
                nullInactivity={nullInactivity}
                onNullInactivity={setNullInactivity}
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
        />
      </div>

      {/* Hacking Pool Modal */}
      {pendingRoll && <HackingPoolModal request={pendingRoll} />}

      {/* Noticing IC — queue shows one modal at a time */}
      {noticingICQueue.length > 0 && (
        <NoticingICModal
          ic={noticingICQueue[0]}
          sensorsDice={Math.max(1, session.character.deck.sensors - (session.personaCondition?.sensors ?? 0))}
          onResult={(noticed, roll) => {
            addLog(
              'ic-activation',
              `Noticing IC: ${noticed ? 'NOTICED' : 'UNNOTICED'} — ${noticingICQueue[0].type}`,
              noticed
                ? `Sensors ${roll.successes} hits vs TN ${noticingICQueue[0].currentRating} — decker aware, acts normally.`
                : `Sensors ${roll.successes} hits vs TN ${noticingICQueue[0].currentRating} — IC acts first this pass.`,
              [roll],
            );
            setNoticingICQueue(prev => prev.slice(1));
          }}
        />
      )}

      {/* Locate File / Slave search modal */}
      {locateSearchMode && host && (
        <LocateSearchModal
          mode={locateSearchMode}
          host={host}
          character={session.character}
          session={session}
          hackingPoolAvailable={hackingPoolAvailable}
          alreadyLocatedIds={locateSearchMode === 'file'
            ? (session.locatedFiles?.[host.id] ?? [])
            : (session.locatedSlaves?.[host.id] ?? [])}
          onResult={handleLocateSearchResult}
          onClose={() => setLocateSearchMode(null)}
        />
      )}

      {/* Dump Shock Modal */}
      {dumpShock && (
        <DumpShockModal
          host={dumpShock.host}
          character={session.character}
          onResult={(stunBoxes) => {
            if (stunBoxes > 0) dispatch({ type: 'TAKE_STUN', payload: stunBoxes });
            addLog('damage', 'Dump Shock', `Body ${session.character.attributes.body} vs TN ${dumpShock.host.securityValue} — ${stunBoxes} Stun boxes`);
            setDumpShock(null);
            if (dumpShock.afterNav) navigate('/runner');
          }}
        />
      )}

      {/* Simsense Overload Modal */}
      {simsenseOverload && (
        <SimsenseOverloadModal
          level={simsenseOverload.level}
          willpower={session.character.attributes.willpower}
          onResult={(failed) => {
            if (failed) {
              dispatch({ type: 'TAKE_STUN', payload: 1 });
              addLog('damage', 'Simsense Overload', 'Willpower Test failed — 1 Stun box (Light wound)');
            } else {
              addLog('system', 'Simsense Overload resisted', 'Willpower Test passed — no stun');
            }
            setSimsenseOverload(null);
          }}
        />
      )}

      {/* Analyze Host picker */}
      {analyzeHostPick && host && (
        <AnalyzeHostPickerModal
          host={host}
          picks={analyzeHostPick.picks}
          existing={session.knownHosts?.[host.id]}
          onConfirm={(payload) => {
            dispatch({ type: 'REVEAL_HOST_INFO', payload: { hostId: host.id, ...payload } });
            const parts: string[] = [];
            if (payload.securityRating) parts.push('Security Rating');
            if (payload.subsystems) parts.push(...Object.keys(payload.subsystems).map(k => k[0].toUpperCase() + k.slice(1)));
            addLog('operation', 'Analyze Host — info extracted', parts.join(', '));
            setAnalyzeHostPick(null);
          }}
          onClose={() => setAnalyzeHostPick(null)}
        />
      )}
    </div>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────

function TopBar({ session, host, hackingPoolAvailable, simpleActionsUsed, onEndTurn, onDisconnect }: {
  session: import('@/types').RunnerSession;
  host: import('@/types').Host | undefined;
  hackingPoolAvailable: number;
  simpleActionsUsed: number;
  onEndTurn: () => void;
  onDisconnect: () => void;
}) {
  const al = session.alertLevel;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 border-b text-[13px] flex-shrink-0"
      style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-card)', height: 40 }}
    >
      {/* Host name + security code */}
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-bold text-[var(--color-foreground)] truncate">
          {host?.name ?? 'NO HOST'}
        </span>
        {host && (
          <span
            className="text-[11px] px-1.5 py-0.5 rounded-sm font-bold tracking-widest flex-shrink-0"
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

      {/* Turn counter + action pips */}
      <span className="text-[var(--color-muted-foreground)] flex-shrink-0 flex items-center gap-1.5">
        TURN <span className="text-[var(--color-foreground)]">{session.combatTurn}</span>
        <span className="flex gap-0.5 ml-1" title={`${simpleActionsUsed}/2 simple actions used`}>
          <span className={`inline-block w-2 h-2 rounded-sm ${simpleActionsUsed >= 1 ? 'bg-[var(--color-primary)]' : 'bg-gray-700'}`} />
          <span className={`inline-block w-2 h-2 rounded-sm ${simpleActionsUsed >= 2 ? 'bg-[var(--color-primary)]' : 'bg-gray-700'}`} />
        </span>
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Actions */}
      <Button
        size="sm"
        variant="outline"
        onClick={onEndTurn}
        className="text-[12px] h-6 px-2 flex-shrink-0"
      >
        [ END TURN ]
      </Button>
      <button
        onClick={onDisconnect}
        className="text-[12px] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors flex-shrink-0"
      >
        ← Disconnect
      </button>
    </div>
  );
}

// ─── Left Column ──────────────────────────────────────────────────────────────

function LeftColumn({ session, dispatch, addLog }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
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
  const deck = session.character.deck;
  const boxes = session.personaBoxes ?? 0;
  const TRACK = 10;

  // Wound level boundaries
  const woundLabel = boxes >= 10 ? 'CRASHED'
    : boxes >= 7 ? 'SERIOUS (+3 TN)'
    : boxes >= 4 ? 'MODERATE (+2 TN)'
    : boxes >= 1 ? 'LIGHT (+1 TN)'
    : 'NOMINAL';
  const woundColor = boxes >= 10 ? '#a855f7'
    : boxes >= 7 ? '#ef4444'
    : boxes >= 4 ? '#f59e0b'
    : boxes >= 1 ? '#eab308'
    : '#22c55e';

  function addBox() {
    dispatch({ type: 'TAKE_PERSONA_DAMAGE', payload: 1 });
    addLog('damage', 'Persona box taken', 'Persona +1 box');
  }

  return (
    <PanelCard title="PERSONA" subtitle={deck.name}>
      {/* Base attribute reference */}
      <div className="grid grid-cols-4 gap-1 mb-2">
        {[
          { label: 'BOD', val: deck.bod },
          { label: 'EVA', val: deck.evasion },
          { label: 'SEN', val: deck.sensors },
          { label: 'MAS', val: deck.masking },
        ].map(({ label, val }) => (
          <div key={label} className="flex flex-col items-center border border-[var(--color-border)] py-1 px-0.5">
            <span className="text-[10px] text-[var(--color-muted-foreground)]">{label}</span>
            <span className="text-[13px] font-bold text-[var(--color-foreground)]">{val}</span>
          </div>
        ))}
      </div>

      {/* Condition monitor — 10 boxes */}
      <div className="flex flex-col gap-0.5">
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--color-muted-foreground)]">ICON TRACK</span>
          <span style={{ color: woundColor }}>{boxes}/10 — {woundLabel}</span>
        </div>
        <div className="flex gap-0.5">
          {Array.from({ length: TRACK }).map((_, i) => {
            const filled = i < boxes;
            const color = i >= 9 ? '#a855f7' : i >= 6 ? '#ef4444' : i >= 3 ? '#f59e0b' : '#eab308';
            return (
              <div
                key={i}
                className="h-3 flex-1 border"
                style={{
                  borderColor: filled ? color : 'var(--color-border)',
                  backgroundColor: filled ? `${color}66` : 'transparent',
                }}
              />
            );
          })}
        </div>
        {/* Wound level markers */}
        <div className="flex text-[9px] text-[var(--color-muted-foreground)] mt-0.5">
          <span className="flex-[3] text-center border-r border-[var(--color-border)]">L</span>
          <span className="flex-[3] text-center border-r border-[var(--color-border)]">M</span>
          <span className="flex-[3] text-center border-r border-[var(--color-border)]">S</span>
          <span className="flex-1 text-center">D</span>
        </div>
      </div>

      {boxes >= 10 && (
        <div
          className="text-center text-[12px] font-bold tracking-widest py-1 mt-1 border"
          style={{ borderColor: '#a855f7', color: '#a855f7', backgroundColor: '#a855f710' }}
        >
          PERSONA CRASHED — DECKER DUMPED
        </div>
      )}

      <button
        onClick={addBox}
        className="mt-2 text-[11px] tracking-wider text-[var(--color-muted-foreground)] hover:text-[var(--color-primary)] border border-[var(--color-border)] px-2 py-1 w-full transition-colors"
      >
        + Take Box (manual)
      </button>
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
  const stun = session.stunDamage;
  const phys = session.physDamage;

  function addStun() {
    dispatch({ type: 'TAKE_STUN', payload: 1 });
    addLog('damage', 'Stun damage taken', 'Stun +1');
  }
  function addPhys() {
    dispatch({ type: 'TAKE_PHYS', payload: 1 });
    addLog('damage', 'Physical damage taken', 'Physical +1');
  }

  const stunLabel = stun >= 10 ? 'UNCONSCIOUS' : stun >= 7 ? 'Serious' : stun >= 4 ? 'Moderate' : stun >= 1 ? 'Light' : '';
  const physLabel = phys >= 10 ? 'DEAD' : phys >= 7 ? 'Serious' : phys >= 4 ? 'Moderate' : phys >= 1 ? 'Light' : '';

  return (
    <PanelCard title="BODY CONDITION">
      <TrackRow label="STUN" filled={stun} total={TRACK} color="#eab308" />
      {stunLabel && (
        <div className="text-[10px] text-right mt-0.5" style={{ color: stun >= 10 ? '#a855f7' : '#eab308' }}>
          {stunLabel}
        </div>
      )}
      <TrackRow label="PHYS" filled={phys} total={TRACK} color="#ef4444" />
      {physLabel && (
        <div className="text-[10px] text-right mt-0.5" style={{ color: phys >= 10 ? '#a855f7' : '#ef4444' }}>
          {physLabel}
        </div>
      )}
      <div className="flex gap-1 mt-2">
        <button
          onClick={addStun}
          className="flex-1 text-[11px] tracking-wider border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:border-[#eab308] hover:text-[#eab308] transition-colors"
        >
          +1 Stun
        </button>
        <button
          onClick={addPhys}
          className="flex-1 text-[11px] tracking-wider border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:border-[#ef4444] hover:text-[#ef4444] transition-colors"
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
      <div className="flex justify-between text-[11px]">
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
  const df = calcDetectionFactor(session);
  const dfDegraded = (session.suppressedIC ?? []).length > 0;

  return (
    <PanelCard title="HACKING POOL">
      {/* Circle display */}
      <div className="flex items-center justify-center py-1">
        <div
          className="w-14 h-14 rounded-full border-2 flex flex-col items-center justify-center"
          style={{ borderColor: 'var(--color-primary)' }}
        >
          <span className="text-xl font-bold" style={{ color: 'var(--color-primary)' }}>{session.hackingPoolTotal}</span>
          <span className="text-[10px] text-[var(--color-muted-foreground)]">TOTAL</span>
        </div>
      </div>

      {/* Detection Factor */}
      <div className="flex justify-between text-[11px] mt-1">
        <span className="text-[var(--color-muted-foreground)]">Detection Factor</span>
        <span className="font-bold" style={{ color: dfDegraded ? '#f59e0b' : 'var(--color-primary)' }}>{df}</span>
      </div>

      {/* Pool breakdown */}
      <div className="flex justify-between text-[11px] mt-1">
        <span className="text-[var(--color-muted-foreground)]">OPS avail</span>
        <span style={{ color: 'var(--color-primary)' }} className="font-bold">{opsAvailable}</span>
      </div>
      {session.suppressionPool > 0 && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--color-muted-foreground)]">SUPPRESS reserved</span>
          <span style={{ color: '#f59e0b' }} className="font-bold">{session.suppressionPool}</span>
        </div>
      )}
      {session.hackingPoolUsed > 0 && (
        <div className="flex justify-between text-[11px]">
          <span className="text-[var(--color-muted-foreground)]">Used this turn</span>
          <span style={{ color: 'var(--color-muted-foreground)' }}>{session.hackingPoolUsed}</span>
        </div>
      )}

      {/* Suppression Reserve slider */}
      <div className="mt-2 border-t border-[var(--color-border)] pt-2">
        <div className="text-[11px] tracking-wider text-[var(--color-muted-foreground)] mb-1">SUPPRESSION RESERVE</div>
        <input
          type="range"
          min={0}
          max={session.hackingPoolTotal - session.hackingPoolUsed}
          value={session.suppressionPool}
          onChange={(e) => dispatch({ type: 'SET_SUPPRESSION_POOL', payload: Number(e.target.value) })}
          className="w-full accent-[#f59e0b]"
        />
        <div className="flex justify-between text-[11px] text-[var(--color-muted-foreground)]">
          <span>0</span>
          <span>{session.hackingPoolTotal - session.hackingPoolUsed}</span>
        </div>
        {session.suppressionPool > 0 ? (
          <div className="text-[11px] mt-0.5" style={{ color: '#f59e0b' }}>
            {session.suppressionPool} dice auto-defend vs IC
          </div>
        ) : (
          <div className="text-[11px] mt-0.5 text-[var(--color-muted-foreground)] italic">
            No suppression reserve
          </div>
        )}
      </div>

      <div className="text-center text-[11px] text-[var(--color-muted-foreground)] mt-1">
        TURN <span className="text-[var(--color-foreground)]">{session.combatTurn}</span>
      </div>
      <button
        onClick={() => dispatch({ type: 'END_COMBAT_TURN' })}
        className="mt-2 w-full text-[11px] tracking-wider border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
      >
        End Combat Turn
      </button>
    </PanelCard>
  );
}

// ─── Center: Host Info Card ───────────────────────────────────────────────────

function HostInfoCard({ host, alertLevel, knowledge }: {
  host: import('@/types').Host;
  alertLevel: AlertLevel;
  knowledge?: import('@/types').HostKnowledge;
}) {
  const subsystems: Array<{ key: Parameters<typeof getEffectiveSubsystemRating>[1]; label: string }> = [
    { key: 'access',  label: 'Access' },
    { key: 'files',   label: 'Files' },
    { key: 'slave',   label: 'Slave' },
    { key: 'index',   label: 'Index' },
    { key: 'control', label: 'Control' },
  ];

  const alertMod = alertLevel !== 'none' ? 2 : 0;
  const knowsSecRating = knowledge?.securityRating ?? false;
  const codeColor = knowsSecRating ? SECURITY_CODE_COLORS[host.securityCode] : 'var(--color-muted-foreground)';

  return (
    <PanelCard title="CURRENT HOST">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="font-bold text-xs text-[var(--color-foreground)]">{host.name}</div>
          {host.description && (
            <div className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5 line-clamp-2">{host.description}</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
          <span
            className="text-[11px] px-1.5 py-0.5 font-bold tracking-widest border"
            style={{ color: codeColor, borderColor: codeColor, backgroundColor: `${codeColor}18` }}
          >
            {knowsSecRating ? host.securityCode : '???'}
          </span>
          <span className="text-[11px] text-[var(--color-muted-foreground)]">
            SV {knowsSecRating ? host.securityValue : '?'}
          </span>
        </div>
      </div>

      {/* Subsystems table */}
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[var(--color-muted-foreground)]">
            <th className="text-left font-normal pb-1">Subsystem</th>
            <th className="text-right font-normal pb-1">Base</th>
            <th className="text-right font-normal pb-1">Eff.</th>
          </tr>
        </thead>
        <tbody>
          {subsystems.map(({ key, label }) => {
            const known = knowledge?.subsystems?.[key] ?? false;
            const base = host.subsystems[key];
            const eff = getEffectiveSubsystemRating(host, key, alertLevel);
            return (
              <tr key={key}>
                <td className="py-0.5 text-[var(--color-muted-foreground)]">{label}</td>
                <td className="text-right" style={{ color: known ? 'var(--color-foreground)' : 'var(--color-muted-foreground)' }}>
                  {known ? base : '?'}
                </td>
                <td
                  className="text-right font-bold"
                  style={{ color: !known ? 'var(--color-muted-foreground)' : alertMod > 0 ? '#f59e0b' : 'var(--color-foreground)' }}
                >
                  {known ? eff : '?'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {alertMod > 0 && knowsSecRating && (
        <div className="mt-1 text-[11px]" style={{ color: '#f59e0b' }}>
          +{alertMod} alert modifier active
        </div>
      )}
      {!knowsSecRating && !knowledge?.subsystems?.access && (
        <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
          Run Analyze Security or Analyze Host to reveal host data.
        </div>
      )}
    </PanelCard>
  );
}

// ─── Analyze Host Picker Modal ────────────────────────────────────────────────

function AnalyzeHostPickerModal({ host, picks, existing, onConfirm, onClose }: {
  host: import('@/types').Host;
  picks: number;
  existing?: import('@/types').HostKnowledge;
  onConfirm: (payload: { securityRating?: boolean; subsystems?: Partial<Record<string, boolean>> }) => void;
  onClose: () => void;
}) {
  type Choice = 'securityRating' | keyof import('@/types').SubsystemRatings;

  const allChoices: Array<{ key: Choice; label: string }> = [
    { key: 'securityRating', label: 'Security Rating (Code + SV)' },
    { key: 'access',         label: 'Access subsystem rating' },
    { key: 'files',          label: 'Files subsystem rating' },
    { key: 'slave',          label: 'Slave subsystem rating' },
    { key: 'index',          label: 'Index subsystem rating' },
    { key: 'control',        label: 'Control subsystem rating' },
  ];

  // Filter out already-known items
  const available = allChoices.filter(c => {
    if (c.key === 'securityRating') return !(existing?.securityRating);
    return !(existing?.subsystems?.[c.key as keyof import('@/types').SubsystemRatings]);
  });

  const [selected, setSelected] = useState<Set<Choice>>(new Set());

  function toggle(key: Choice) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < picks) {
        next.add(key);
      }
      return next;
    });
  }

  function confirm() {
    const payload: { securityRating?: boolean; subsystems?: Partial<Record<string, boolean>> } = {};
    if (selected.has('securityRating')) payload.securityRating = true;
    const subs = Array.from(selected).filter(k => k !== 'securityRating');
    if (subs.length > 0) payload.subsystems = Object.fromEntries(subs.map(k => [k, true]));
    onConfirm(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div
        className="border p-4 font-mono text-xs flex flex-col gap-3"
        style={{
          backgroundColor: 'var(--color-card)',
          borderColor: 'var(--color-primary)',
          minWidth: 320,
          maxWidth: 420,
        }}
      >
        <div>
          <div className="text-[11px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-1">
            Analyze Host — {host.name}
          </div>
          <div className="font-bold text-[var(--color-foreground)]">
            {picks} net success{picks !== 1 ? 'es' : ''} — choose {picks} item{picks !== 1 ? 's' : ''} to reveal
          </div>
          <div className="text-[11px] text-[var(--color-muted-foreground)] mt-0.5">
            Selected: {selected.size} / {picks}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {available.length === 0 ? (
            <div className="text-[11px] text-[var(--color-muted-foreground)]">All host data already known.</div>
          ) : (
            available.map(({ key, label }) => {
              const isSelected = selected.has(key);
              const disabled = !isSelected && selected.size >= picks;
              return (
                <button
                  key={key}
                  onClick={() => toggle(key)}
                  disabled={disabled}
                  className="text-left px-2 py-1.5 border transition-all"
                  style={{
                    borderColor: isSelected ? 'var(--color-primary)' : 'var(--color-border)',
                    backgroundColor: isSelected ? 'var(--color-primary)' + '22' : 'transparent',
                    color: disabled ? 'var(--color-muted-foreground)' : 'var(--color-foreground)',
                    cursor: disabled ? 'default' : 'pointer',
                  }}
                >
                  <span className="mr-2">{isSelected ? '▶' : '○'}</span>
                  {label}
                </button>
              );
            })
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="text-[11px] px-3 py-1 border border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={confirm}
            disabled={selected.size === 0}
            className="text-[11px] px-3 py-1 border transition-colors"
            style={{
              borderColor: selected.size > 0 ? 'var(--color-primary)' : 'var(--color-border)',
              color: selected.size > 0 ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
            }}
          >
            Confirm ({selected.size}/{picks})
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Active IC Panel ──────────────────────────────────────────────────────────

function ActiveICPanel({ session, dispatch, addLog, onDumpShock, onSimsenseOverload }: {
  session: import('@/types').RunnerSession;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
  onDumpShock: (host: Host) => void;
  onSimsenseOverload: (level: DmgLevel) => void;
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

    if (result.personaBoxes > 0) {
      dispatch({ type: 'TAKE_PERSONA_DAMAGE', payload: result.personaBoxes });

      const newBoxes = (session.personaBoxes ?? 0) + result.personaBoxes;
      const currentHost = session.runPacket?.hosts?.find(h => h.id === session.currentHostId);

      // Deadly damage or 10 boxes → persona crash → dump shock
      if (result.personaDamageLevel === 'D' || newBoxes >= 10) {
        if (currentHost) onDumpShock(currentHost);
      } else if (
        result.personaDamageLevel &&
        (result.icCategory === 'ProactiveWhite' || result.icCategory === 'ProactiveGray' ||
         result.icCategory === 'ReactiveWhite'  || result.icCategory === 'ReactiveGray')
      ) {
        // White or gray IC only — trigger Simsense Overload check
        onSimsenseOverload(result.personaDamageLevel);
      }
    }
    if (result.bodyStun > 0) dispatch({ type: 'TAKE_STUN', payload: result.bodyStun });
    if (result.bodyPhys > 0) dispatch({ type: 'TAKE_PHYS', payload: result.bodyPhys });

    // Crippler / Ripper — damage to a specific persona attribute
    if (result.attributeDamage) {
      const attr = result.attributeDamage.attribute.toLowerCase() as 'bod' | 'evasion' | 'masking' | 'sensors';
      dispatch({ type: 'DAMAGE_PERSONA', payload: { [attr]: result.attributeDamage.boxes } });
      if (result.causedDump) {
        const currentHost = session.runPacket?.hosts?.find(h => h.id === session.currentHostId);
        if (currentHost) onDumpShock(currentHost);
      }
    }

    if (result.evadeTurns > 0) {
      dispatch({ type: 'EVADE_IC', payload: { icId: combatTarget.id, turns: result.evadeTurns } });
    }

    addLog('combat', `Cybercombat vs ${combatTarget.type}-${combatTarget.rating}`, result.log);
  }

  const [pendingCrashIC, setPendingCrashIC] = useState<ICInstance | null>(null);

  return (
    <>
    <PanelCard title="ACTIVE IC">
      {noAttackError && (
        <div className="text-[11px] mb-1" style={{ color: '#ef4444' }}>{noAttackError}</div>
      )}
      {session.activeIC.length === 0 ? (
        <div className="text-[12px] text-[var(--color-muted-foreground)] py-2">No active IC</div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {session.activeIC.map((ic) => {
            const def = IC_DEFINITIONS[ic.type];
            const catColor = IC_CATEGORY_COLOR[ic.category];
            return (
              <div
                key={ic.id}
                className="flex flex-col gap-1 border p-2 text-[12px]"
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
                  {(session.evadingIC?.[ic.id] ?? 0) > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 border"
                      style={{ borderColor: '#a855f7', color: '#a855f7', backgroundColor: '#a855f710' }}>
                      EVADED {session.evadingIC[ic.id]}T
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openCombat(ic)}
                    className="flex-1 text-[11px] border px-1.5 py-0.5 hover:bg-[var(--color-primary)]/10 transition-colors font-bold"
                    style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
                  >
                    Combat
                  </button>
                  <button
                    onClick={() => crashIC(ic.id, false)}
                    className="text-[11px] border border-[#ef4444] text-[#ef4444] px-1.5 py-0.5 hover:bg-[#ef4444]/10 transition-colors"
                  >
                    Crash
                  </button>
                  <button
                    onClick={() => crashIC(ic.id, true)}
                    className="text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-1.5 py-0.5 hover:border-[#f59e0b] hover:text-[#f59e0b] transition-colors"
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
          <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1">SUPPRESSED IC</div>
          {(session.suppressedIC ?? []).map((ic) => (
            <div key={ic.id} className="text-[11px] text-[var(--color-muted-foreground)] opacity-60">
              {ic.type}-{ic.rating}
            </div>
          ))}
          <div className="text-[11px] mt-1" style={{ color: '#f59e0b' }}>
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
          className="border p-4 font-mono text-[13px] flex flex-col gap-3"
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
            className="text-[11px] text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-2 py-1 hover:text-[var(--color-foreground)] transition-colors"
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
          className="border p-4 font-mono text-[13px] flex flex-col gap-3"
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
              className="flex-1 border py-1.5 font-bold text-[12px] hover:bg-[#ef4444]/10 transition-colors"
              style={{ borderColor: '#ef4444', color: '#ef4444' }}
            >
              Crash (+{pendingCrashIC.rating} tally)
            </button>
            <button
              onClick={() => {
                crashIC(pendingCrashIC.id, true);
                setPendingCrashIC(null);
              }}
              className="flex-1 border py-1.5 font-bold text-[12px] hover:bg-[#f59e0b]/10 transition-colors"
              style={{ borderColor: '#f59e0b', color: '#f59e0b' }}
            >
              Suppress (-1 DF)
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Combat Modal — decker-initiated */}
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

    {/* IC Attack Queue — proactive IC attack when decker uses action elsewhere */}
    {!combatTarget && icAttackQueue.length > 0 && (
      <CombatModal
        ic={icAttackQueue[0]}
        attackProgram={null}
        character={session.character}
        session={session}
        hackingPoolAvailable={hackingPoolAvailable}
        suppressionPool={session.suppressionPool}
        icInitiated={true}
        onClose={() => setIcAttackQueue(prev => prev.slice(1))}
        onResult={(result) => {
          handleCombatResult({ ...result, icDamage: 0, icCrashed: false });
          setIcAttackQueue(prev => prev.slice(1));
        }}
      />
    )}
    </>
  );
}

// ─── Operations Panel ─────────────────────────────────────────────────────────

const FUZZY_OPTIONS: Array<{ label: string; mod: number }> = [
  { label: 'Very Vague (+2)',   mod: +2 },
  { label: 'Vague (+1)',        mod: +1 },
  { label: 'Normal (±0)',       mod:  0 },
  { label: 'Specific (-1)',     mod: -1 },
  { label: 'Very Specific (-2)', mod: -2 },
];

const NULL_INACTIVITY_OPTIONS: Array<{ label: string; mod: number }> = [
  { label: '< 10 seconds (+0)', mod: 0 },
  { label: '< 1 minute (+1)',   mod: 1 },
  { label: '< 1 hour (+2)',     mod: 2 },
  { label: '< 12 hours (+4)',   mod: 4 },
];

// Group operations by subsystem category for display
const OP_GROUPS: Array<{ title: string; keys: string[] }> = [
  { title: 'ACCESS',  keys: ['LogonToHost', 'LogonToLTG', 'GracefulLogoff', 'DecryptAccess'] },
  { title: 'CONTROL', keys: ['AnalyzeHost', 'AnalyzeIC', 'AnalyzeIcon', 'AnalyzeSecurity', 'AnalyzeSubsystem', 'NullOperation'] },
  { title: 'INDEX',   keys: ['LocateAccessNode', 'LocateFile', 'LocateIC', 'LocatePaydata', 'LocateSlave', 'LocateDecker'] },
  { title: 'FILES',   keys: ['DownloadData', 'UploadData', 'EditFile', 'DecryptFile', 'MakeComcall', 'TapComcall'] },
  { title: 'SLAVE',   keys: ['ControlSlave', 'EditSlave', 'MonitorSlave', 'DecryptSlave'] },
  { title: 'MISC',    keys: ['SwapMemory'] },
];

function OperationsPanel({ opKeys, onRun, host, alertLevel, programs, knowledge, fuzzyMod, onFuzzyMod, nullInactivity, onNullInactivity }: {
  opKeys: string[];
  onRun: (key: string) => void;
  host: import('@/types').Host;
  alertLevel: AlertLevel;
  programs: Program[];
  knowledge?: import('@/types').HostKnowledge;
  fuzzyMod: number;
  onFuzzyMod: (v: number) => void;
  nullInactivity: number;
  onNullInactivity: (v: number) => void;
}) {
  const hasInterrogation = opKeys.some(k => OPERATION_DEFINITIONS[k]?.isInterrogation);
  const hasNull = opKeys.includes('NullOperation');

  return (
    <PanelCard title="OPERATIONS">
      {/* Fuzzy TN modifier — shown for interrogation ops */}
      {hasInterrogation && (
        <div className="mb-2 p-1.5 border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-1">
            Search Specificity (Locate ops)
          </div>
          <select
            value={fuzzyMod}
            onChange={e => onFuzzyMod(Number(e.target.value))}
            className="text-[11px] w-full bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-foreground)] px-1 py-0.5"
          >
            {FUZZY_OPTIONS.map(o => (
              <option key={o.mod} value={o.mod}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Null Operation inactivity modifier */}
      {hasNull && (
        <div className="mb-2 p-1.5 border border-[var(--color-border)] bg-[var(--color-card)]">
          <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-1">
            Null Op — Inactivity
          </div>
          <select
            value={nullInactivity}
            onChange={e => onNullInactivity(Number(e.target.value))}
            className="text-[11px] w-full bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-foreground)] px-1 py-0.5"
          >
            {NULL_INACTIVITY_OPTIONS.map(o => (
              <option key={o.mod} value={o.mod}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Operations grouped by subsystem */}
      <div className="flex flex-col gap-2">
        {OP_GROUPS.map(group => {
          const visible = group.keys.filter(k => opKeys.includes(k) && OPERATION_DEFINITIONS[k]);
          if (visible.length === 0) return null;
          return (
            <div key={group.title}>
              <div className="text-[10px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-1 px-0.5">
                {group.title}
              </div>
              <div className="grid grid-cols-2 gap-1">
                {visible.map(key => {
                  const op = OPERATION_DEFINITIONS[key];

                  // Determine if the subsystem driving this TN is known yet
                  const subsystemKnown = (() => {
                    if (op.subsystem === 'none') return true; // SV-based ops always show TN
                    if (op.subsystem === 'control') return knowledge?.securityRating ?? false;
                    return knowledge?.subsystems?.[op.subsystem as keyof import('@/types').SubsystemRatings] ?? false;
                  })();

                  const baseTN = op.subsystem === 'none'
                    ? host.securityValue
                    : getEffectiveSubsystemRating(host, op.subsystem as Parameters<typeof getEffectiveSubsystemRating>[1], alertLevel);

                  const contextMod = op.isInterrogation ? fuzzyMod
                    : key === 'NullOperation' ? nullInactivity
                    : 0;

                  const { reduction, label: reductionLabel } = getProgramTNReduction(key, programs);
                  const effectiveTN = op.subsystem === 'none' && !op.isInterrogation
                    ? host.securityValue
                    : Math.max(2, baseTN + contextMod - reduction);

                  const noTest = key === 'SwapMemory';

                  const actionColor: Record<string, string> = {
                    Free:    '#4ade80',
                    Simple:  '#60a5fa',
                    Complex: '#f97316',
                  };

                  return (
                    <button
                      key={key}
                      onClick={() => onRun(key)}
                      disabled={noTest}
                      className="text-left border border-[var(--color-border)] p-1.5 hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-all disabled:opacity-40 disabled:cursor-default"
                    >
                      {/* Name + action badge */}
                      <div className="flex items-start justify-between gap-1">
                        <div className="text-[11px] font-bold text-[var(--color-foreground)] leading-tight">{op.label}</div>
                        <span
                          className="text-[9px] px-0.5 flex-shrink-0 font-bold tracking-wide border"
                          style={{ color: actionColor[op.action], borderColor: actionColor[op.action] + '66' }}
                        >
                          {op.action[0]}
                        </span>
                      </div>

                      {/* TN + utility */}
                      {!noTest && (
                        <div className="text-[10px] mt-0.5 text-[var(--color-muted-foreground)]">
                          <span className="font-bold" style={{ color: subsystemKnown ? 'var(--color-foreground)' : 'var(--color-muted-foreground)' }}>
                            TN {subsystemKnown ? effectiveTN : '?'}
                          </span>
                          {op.utility && (
                            <span> · {op.utility}</span>
                          )}
                          {op.isInterrogation && op.interrogationGoal && (
                            <span className="ml-1 text-[#60a5fa]">{op.interrogationGoal}✓</span>
                          )}
                        </div>
                      )}

                      {/* Utility reduction applied */}
                      {reduction > 0 && (
                        <div className="text-[9px] mt-0.5" style={{ color: '#4ade8088' }}>
                          {reductionLabel}
                        </div>
                      )}

                      {/* Tally warning */}
                      {op.tallyOnSuccess > 0 && (
                        <div className="text-[9px] mt-0.5 text-[#ef444499]">
                          +{op.tallyOnSuccess} tally on success
                        </div>
                      )}

                      {/* Flags */}
                      <div className="flex gap-1 mt-0.5 flex-wrap">
                        {op.isMonitored && (
                          <span className="text-[9px] text-[#f59e0b]">monitored</span>
                        )}
                        {op.isOngoing && (
                          <span className="text-[9px] text-[var(--color-muted-foreground)]">ongoing</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </PanelCard>
  );
}

// ─── Right Column ─────────────────────────────────────────────────────────────

function RightColumn({ session, host, dispatch: _dispatch, addLog: _addLog }: {
  session: import('@/types').RunnerSession;
  host: import('@/types').Host | undefined;
  dispatch: React.Dispatch<import('@/runner/runnerContext').RunnerAction>;
  addLog: (type: LogEntryType, title: string, details?: string) => void;
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
      {/* Haul summary */}
      <HaulPanel session={session} host={host} />

      {/* Log */}
      <div className="flex flex-col flex-1 overflow-hidden p-2">
        <div className="text-[11px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-2 px-1">
          Matrix Log
        </div>
        <div ref={logRef} className="flex-1 overflow-y-auto flex flex-col gap-1 pr-1">
          {reversedLog.length === 0 ? (
            <div className="text-[11px] text-[var(--color-muted-foreground)] px-1">No events logged</div>
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
                  <span className="text-[11px] text-[var(--color-muted-foreground)]">T{entry.id.slice(0, 4)}</span>
                </div>
                <div className="text-[12px] font-bold text-[var(--color-foreground)] leading-tight">{entry.title}</div>
                {entry.details && (
                  <div className="text-[11px] text-[var(--color-muted-foreground)] leading-tight mt-0.5">{entry.details}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

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
      <div className="flex justify-between text-[11px] text-[var(--color-muted-foreground)] mb-1">
        <span>Memory</span>
        <span>{totalMp}/{maxMp} Mp</span>
      </div>
      {loaded.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted-foreground)]">No programs loaded</div>
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
                <div className="flex justify-between text-[11px]">
                  <span style={{ color: isAttack ? 'var(--color-primary)' : isSleaze ? '#a855f7' : isArmor ? '#22c55e' : 'var(--color-foreground)' }}>
                    {p.name}
                  </span>
                  <span className="text-[var(--color-muted-foreground)]">{p.rating}</span>
                </div>
                {isSleaze && (
                  <div className="text-[10px] pl-1" style={{ color: '#a855f766' }}>
                    DF: +{p.rating} (part of Detection Factor)
                  </div>
                )}
                {!isSleaze && boostedOps.length > 0 && (
                  <div className="text-[10px] pl-1" style={{ color: '#4ade8066' }}>
                    -{p.rating} TN: {boostedOps.slice(0, 3).join(', ')}{boostedOps.length > 3 ? '…' : ''}
                  </div>
                )}
                {isArmor && (
                  <div className="text-[10px] pl-1" style={{ color: '#22c55e66' }}>
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

// ─── Files Panel ─────────────────────────────────────────────────────────────

type FileState = 'located' | 'decrypted' | 'read' | 'downloaded' | 'edited';
type BombPendingAction = { fileId: string; action: 'read' | 'download' } | null;

function DefenseBadge({ defense }: { defense: HostFile['defense'] }) {
  if (defense === 'none') return null;
  const badges: React.ReactNode[] = [];
  if (defense === 'encrypted' || defense === 'encryptedAndBomb') {
    badges.push(
      <span key="enc" className="text-[11px] font-bold px-1 py-0.5 border" style={{ color: '#eab308', borderColor: '#eab30844', backgroundColor: '#eab30818' }}>
        🔒 ENC
      </span>
    );
  }
  if (defense === 'dataBomb' || defense === 'encryptedAndBomb') {
    badges.push(
      <span key="bomb" className="text-[11px] font-bold px-1 py-0.5 border" style={{ color: '#ef4444', borderColor: '#ef444444', backgroundColor: '#ef444418' }}>
        💣 BOMB
      </span>
    );
  }
  if (defense === 'worms') {
    badges.push(
      <span key="worm" className="text-[11px] font-bold px-1 py-0.5 border" style={{ color: '#f97316', borderColor: '#f9731644', backgroundColor: '#f9731618' }}>
        🐛 WORM
      </span>
    );
  }
  return <div className="flex gap-1 flex-wrap">{badges}</div>;
}

function FilesPanel({ host, onOpenLocateSearch, onTallyGained, onOperationComplete }: {
  host: import('@/types').Host;
  onOpenLocateSearch: (mode: 'file' | 'slave') => void;
  onTallyGained: (amount: number) => void;
  onOperationComplete: () => void;
}) {
  const { session, dispatch, addLog } = useRunner();
  const { pendingRoll: filesPendingRoll, requestRoll: filesRequestRoll } = usePoolRoll();
  const [tab, setTab] = useState<'files' | 'paydata'>('files');
  // fileStates tracks decrypt/read/download progress (not location — that's in session)
  const [fileStates, setFileStates] = useState<Record<string, FileState>>({});
  const [bombPending, setBombPending] = useState<BombPendingAction>(null);

  // Reset when host changes
  useEffect(() => {
    setFileStates({});
    setBombPending(null);
  }, [host.id]);

  // Located file IDs from session (persistent across modal closes)
  const locatedFileIds = session.locatedFiles?.[host.id] ?? [];

  // ── Shared roll logic ──────────────────────────────────────────────────────

  async function runFileOp(opKey: string, label: string): Promise<boolean> {
    const rawTN = getEffectiveSubsystemRating(host, opKey === 'LocateFile' || opKey === 'LocatePaydata' ? 'index' : 'files', session.alertLevel);
    const { reduction, label: bonusLabel } = getProgramTNReduction(opKey, session.loadedPrograms);
    const tn = Math.max(2, rawTN - reduction);

    const rollLabel = bonusLabel
      ? `${label} — TN ${tn} (${rawTN} - ${reduction} utility)`
      : `${label} — TN ${tn}`;

    const result = await filesRequestRoll({
      label: rollLabel,
      baseDice: session.character.computerSkill,
      targetNumber: tn,
      requiredSuccesses: 1,
      cancelable: true,
    });
    if (!result) return false;

    const { hostSuccesses, secRoll } = rollHostSecurityTest(session, host.securityValue);
    onOperationComplete(); // snapshot active proactive IC before tally dispatch
    if (hostSuccesses > 0) onTallyGained(hostSuccesses);

    const netSuccesses = result.netSuccesses - hostSuccesses;
    const opSuccess = netSuccesses >= 1 && !result.isCatastrophic;
    const tallyNote = hostSuccesses > 0
      ? ` | Host: ${hostSuccesses} hits → +${hostSuccesses} tally`
      : ' | Host: no hits';

    addLog(
      'operation',
      `${label}: ${opSuccess ? 'SUCCESS' : 'FAILURE'}`,
      `Decker: ${result.netSuccesses} hits, TN ${tn}${tallyNote}`,
      [...(result.rolls ?? []), secRoll],
    );
    return opSuccess;
  }

  // ── Data Bomb trigger ──────────────────────────────────────────────────────

  async function triggerDataBomb(file: HostFile) {
    const rating = file.bombRating ?? 4;
    const bod = session.character.deck.bod - session.personaCondition.bod;
    const bombRoll = rollDice(rating, bod, `Data Bomb (rating ${rating}) vs Bod ${bod}`);
    const physDmg = bombRoll.successes;
    if (physDmg > 0) dispatch({ type: 'TAKE_PHYS', payload: physDmg });
    dispatch({ type: 'ADD_TALLY', payload: rating });
    addLog(
      'damage',
      `DATA BOMB triggered on "${file.name}"`,
      `Bomb rating ${rating} — ${physDmg} Physical damage dealt. +${rating} tally.`,
      [bombRoll],
    );
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleDecrypt(file: HostFile) {
    const ok = await runFileOp('ReadFile', `Decrypt: ${file.name}`);
    if (ok) setFileStates(s => ({ ...s, [file.id]: 'decrypted' }));
  }

  function requestAccessWithBombCheck(file: HostFile, action: 'read' | 'download') {
    const hasBomb = file.defense === 'dataBomb' || file.defense === 'encryptedAndBomb';
    if (hasBomb) {
      setBombPending({ fileId: file.id, action });
    } else {
      void executeFileAccess(file, action);
    }
  }

  async function executeFileAccess(file: HostFile, action: 'read' | 'download') {
    setBombPending(null);
    const hasBomb = file.defense === 'dataBomb' || file.defense === 'encryptedAndBomb';
    if (hasBomb) await triggerDataBomb(file);

    const opKey = action === 'read' ? 'ReadFile' : 'DownloadFile';
    const opLabel = action === 'read' ? `Read File: ${file.name}` : `Download File: ${file.name}`;
    const ok = await runFileOp(opKey, opLabel);
    if (ok) {
      const newState: FileState = action === 'read' ? 'read' : 'downloaded';
      setFileStates(s => ({ ...s, [file.id]: newState }));
    }
  }

  async function handleLocatePaydata(pd: PaydataPoint) {
    const ok = await runFileOp('LocatePaydata', `Locate Paydata: ${pd.name}`);
    if (ok) {
      if (!session.foundPaydata.includes(pd.id)) {
        dispatch({ type: 'FIND_PAYDATA', payload: pd.id });
      }
      addLog('operation', `Paydata found: ${pd.name}`, `Value: ¥${pd.value.toLocaleString()}`);
    }
  }

  const files = host.files ?? [];
  const paydata = host.paydata ?? [];
  const locatedFiles = files.filter(f => locatedFileIds.includes(f.id));
  const unlocatedCount = files.length - locatedFiles.length;

  return (
    <>
    <PanelCard title="HOST FILES">
      {/* Tabs */}
      <div className="flex gap-0 mb-2 border-b border-[var(--color-border)]">
        {(['files', 'paydata'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1 text-[11px] tracking-wider uppercase transition-colors"
            style={{
              color: tab === t ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
              borderBottom: tab === t ? '2px solid var(--color-primary)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t === 'files'
              ? `Data Files (${locatedFiles.length}/${files.length})`
              : `Paydata (${paydata.length})`}
          </button>
        ))}
      </div>

      {tab === 'files' && (
        <div className="flex flex-col gap-1.5">
          {/* Search button */}
          <button
            onClick={() => onOpenLocateSearch('file')}
            className="w-full text-[11px] border border-dashed border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors text-center tracking-wider"
          >
            + SEARCH FOR FILE
          </button>

          {/* Unlocated count placeholder */}
          {unlocatedCount > 0 && (
            <div className="text-[11px] text-[var(--color-muted-foreground)] italic py-0.5 px-1">
              {unlocatedCount} file{unlocatedCount !== 1 ? 's' : ''} undiscovered on this host
            </div>
          )}

          {files.length === 0 ? (
            <div className="text-[11px] text-[var(--color-muted-foreground)] py-1">No files on this host</div>
          ) : locatedFiles.length === 0 ? null : (
            locatedFiles.map(file => {
              const st = fileStates[file.id];
              const isEncrypted = file.defense === 'encrypted' || file.defense === 'encryptedAndBomb';
              const isDecrypted = st === 'decrypted' || st === 'read' || st === 'downloaded';
              const needsDecrypt = isEncrypted && !isDecrypted;
              const canAccess = !needsDecrypt;

              // Status label (file is always "located" since it's in locatedFiles)
              let statusLabel = 'located';
              let statusColor = 'var(--color-primary)';
              if (needsDecrypt) { statusLabel = 'locked'; statusColor = '#eab308'; }
              else if (st === 'decrypted') { statusLabel = 'decrypted'; statusColor = '#22c55e'; }
              else if (st === 'read') { statusLabel = 'read'; statusColor = '#22c55e'; }
              else if (st === 'downloaded') { statusLabel = 'downloaded'; statusColor = '#22c55e'; }
              else if (st === 'edited') { statusLabel = 'edited'; statusColor = '#f59e0b'; }

              return (
                <div
                  key={file.id}
                  className="border border-[var(--color-border)] p-2 hover:border-[var(--color-primary)]/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-bold text-[var(--color-foreground)] truncate">{file.name}</div>
                      <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">{file.sizeMp} Mp</span>
                        <DefenseBadge defense={file.defense} />
                        <span className="text-[11px] font-bold" style={{ color: statusColor }}>{statusLabel}</span>
                      </div>
                    </div>
                  </div>

                  {/* Data bomb warning inline */}
                  {bombPending?.fileId === file.id && (
                    <div className="border border-[#ef4444] p-2 mb-2" style={{ backgroundColor: '#ef444410' }}>
                      <div className="text-[11px] font-bold mb-1" style={{ color: '#ef4444' }}>
                        ⚠ DATA BOMB WILL TRIGGER (rating {file.bombRating ?? 4})
                      </div>
                      <div className="text-[11px] text-[var(--color-muted-foreground)] mb-2">
                        Bomb rolls {file.bombRating ?? 4} dice vs your Bod. Physical damage + tally.
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => void executeFileAccess(file, bombPending.action)}
                          className="flex-1 text-[11px] border border-[#ef4444] text-[#ef4444] px-2 py-1 hover:bg-[#ef4444]/10 transition-colors font-bold"
                        >
                          Accept risk & {bombPending.action}
                        </button>
                        <button
                          onClick={() => setBombPending(null)}
                          className="text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-1 hover:text-[var(--color-foreground)] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-1 flex-wrap">
                    {needsDecrypt && (
                      <button
                        onClick={() => void handleDecrypt(file)}
                        className="text-[11px] border border-[#eab308] text-[#eab308] px-2 py-0.5 hover:bg-[#eab308]/10 transition-colors"
                      >
                        Decrypt
                      </button>
                    )}
                    {canAccess && st !== 'read' && st !== 'downloaded' && (
                      <button
                        onClick={() => requestAccessWithBombCheck(file, 'read')}
                        className="text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-0.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                      >
                        Read
                      </button>
                    )}
                    {canAccess && (
                      <button
                        onClick={async () => {
                          const ok = await runFileOp('EditFile', `Edit File: ${file.name}`);
                          if (ok) {
                            setFileStates(s => ({ ...s, [file.id]: 'edited' }));
                            addLog('operation', `File edited: ${file.name}`, `Contents modified by decker. File marked as altered.`);
                          }
                        }}
                        className="text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-0.5 hover:border-[#f59e0b] hover:text-[#f59e0b] transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {canAccess && st !== 'downloaded' && (
                      <button
                        onClick={() => requestAccessWithBombCheck(file, 'download')}
                        className="text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-0.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                      >
                        Download
                      </button>
                    )}
                  </div>

                  {/* File description shown after read */}
                  {(st === 'read' || st === 'downloaded') && file.description && (
                    <div className="mt-1 text-[11px] text-[var(--color-muted-foreground)] border-l-2 pl-2" style={{ borderLeftColor: '#22c55e' }}>
                      {file.description}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {tab === 'paydata' && (
        <div className="flex flex-col gap-1.5">
          {paydata.length === 0 ? (
            <div className="text-[11px] text-[var(--color-muted-foreground)] py-1">No paydata on this host</div>
          ) : (
            paydata.map(pd => {
              const isFound = session.foundPaydata.includes(pd.id);
              return (
                <div
                  key={pd.id}
                  className="border p-2 transition-colors"
                  style={{ borderColor: isFound ? '#22c55e44' : 'var(--color-border)' }}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-bold text-[var(--color-foreground)] truncate">{pd.name}</span>
                        {isFound && (
                          <span className="text-[10px] font-bold px-1 py-0.5 flex-shrink-0" style={{ color: '#22c55e', backgroundColor: '#22c55e18', border: '1px solid #22c55e44' }}>
                            FOUND
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="text-[11px] font-bold" style={{ color: isFound ? '#22c55e' : 'var(--color-muted-foreground)' }}>
                          ¥{pd.value.toLocaleString()}
                        </span>
                        <span className="text-[11px] text-[var(--color-muted-foreground)]">{pd.dataSizeMp} Mp</span>
                        {pd.defense !== 'none' && (
                          <span className="text-[11px] text-[#f97316]">{pd.defense}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {!isFound && (
                    <button
                      onClick={() => void handleLocatePaydata(pd)}
                      className="text-[11px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-2 py-0.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
                    >
                      Locate Paydata
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </PanelCard>

    {/* FilesPanel needs its own HackingPoolModal instance */}
    {filesPendingRoll && <HackingPoolModal request={filesPendingRoll} />}
    </>
  );
}

// ─── Haul Panel ───────────────────────────────────────────────────────────────

function HaulPanel({ session, host }: {
  session: import('@/types').RunnerSession;
  host: import('@/types').Host | undefined;
}) {
  const foundItems = (host?.paydata ?? []).filter(pd => session.foundPaydata.includes(pd.id));
  const totalValue = foundItems.reduce((sum, pd) => sum + pd.value, 0);

  return (
    <div className="border-b border-[var(--color-border)] p-2 flex-shrink-0">
      <div className="text-[11px] tracking-widest uppercase text-[var(--color-muted-foreground)] mb-1.5">HAUL</div>
      {foundItems.length === 0 ? (
        <div className="text-[11px] text-[var(--color-muted-foreground)] italic">No paydata secured</div>
      ) : (
        <>
          <div className="text-[13px] font-bold mb-1" style={{ color: '#22c55e' }}>
            ¥{totalValue.toLocaleString()} secured
          </div>
          <div className="flex flex-col gap-0.5">
            {foundItems.map(pd => (
              <div key={pd.id} className="flex justify-between text-[11px]">
                <span className="text-[var(--color-muted-foreground)] truncate mr-2">{pd.name}</span>
                <span style={{ color: '#22c55e' }}>¥{pd.value.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Dump Shock Modal ─────────────────────────────────────────────────────────

function DumpShockModal({ host, character, onResult }: {
  host: Host;
  character: import('@/types').CharacterSheet;
  onResult: (stunBoxes: number) => void;
}) {
  const [rolled, setRolled] = useState(false);
  const [roll, setRoll] = useState<import('@/types').DiceRoll | null>(null);
  const [finalBoxes, setFinalBoxes] = useState(0);
  const [finalLevel, setFinalLevel] = useState<DmgLevel>('L');

  const baseLevel = DUMP_SHOCK_LEVEL[host.securityCode];
  const power = host.securityValue;
  const bodyDice = character.attributes.body;

  function handleRoll() {
    const r = rollDice(bodyDice, power, `Body (${bodyDice}) vs TN ${power}`);
    setRoll(r);

    // Stage down by 1 level for every 2 successes
    const stagesDown = Math.floor(r.successes / 2);
    const levels: DmgLevel[] = ['L', 'M', 'S', 'D'];
    const baseIdx = levels.indexOf(baseLevel);
    const staged = levels[Math.max(0, baseIdx - stagesDown)] as DmgLevel;
    setFinalLevel(staged);
    setFinalBoxes(DUMP_SHOCK_BOXES[staged]);
    setRolled(true);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <div
        className="flex flex-col gap-0 border font-mono text-[13px] overflow-y-auto"
        style={{ width: 460, maxHeight: '80vh', borderColor: '#a855f7', backgroundColor: 'var(--color-card)', boxShadow: '0 0 30px #a855f744' }}
      >
        <div className="px-4 py-2 border-b text-[14px] font-bold tracking-widest" style={{ borderColor: '#a855f7', color: '#a855f7' }}>
          DUMP SHOCK
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[12px] text-[var(--color-muted-foreground)]">
            Decker was dumped without a Graceful Logoff. Roll Body resistance against the host's Security Value.
          </div>
          <div className="flex flex-col gap-1 border border-[var(--color-border)] p-2">
            <InfoRow2 label="Host" value={host.name} />
            <InfoRow2 label="Security Value (Power)" value={String(power)} highlight />
            <InfoRow2 label="Base Damage Level" value={`${baseLevel} (${host.securityCode})`} />
            <InfoRow2 label="Roll" value={`Body (${bodyDice}) dice vs TN ${power}`} />
          </div>

          {!rolled && (
            <button
              onClick={handleRoll}
              className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80 transition-opacity"
              style={{ borderColor: '#a855f7', color: '#a855f7' }}
            >
              [ ROLL BODY RESISTANCE ]
            </button>
          )}

          {rolled && roll && (
            <>
              <div className="border border-[var(--color-border)] p-2">
                <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1">Body ({bodyDice}) vs TN {power}</div>
                <div className="flex flex-wrap gap-1 my-1">
                  {roll.dice.map((d, i) => {
                    const hit = d >= roll.targetNumber;
                    return (
                      <div key={i} className="w-7 h-7 flex items-center justify-center text-[13px] font-bold border"
                        style={{ borderColor: hit ? '#22c55e' : '#ef444466', color: hit ? '#22c55e' : '#ef4444', backgroundColor: hit ? '#22c55e18' : '#ef444410' }}>
                        {d}
                      </div>
                    );
                  })}
                </div>
                <div className="text-[12px]">
                  <span className="text-[var(--color-muted-foreground)]">Successes: </span>
                  <span className="font-bold" style={{ color: roll.successes > 0 ? '#22c55e' : '#ef4444' }}>{roll.successes}</span>
                  <span className="text-[var(--color-muted-foreground)] ml-2">— stages down: {Math.floor(roll.successes / 2)}</span>
                </div>
              </div>
              <div
                className="border p-2 text-center font-bold"
                style={{ borderColor: finalBoxes > 0 ? '#a855f7' : '#22c55e', color: finalBoxes > 0 ? '#a855f7' : '#22c55e' }}
              >
                {baseLevel !== finalLevel
                  ? `${baseLevel} → ${finalLevel} (staged down)`
                  : `${finalLevel} (no staging)`}
                {finalBoxes > 0 ? ` — STUN +${finalBoxes} boxes` : ' — No damage'}
              </div>
              <button
                onClick={() => onResult(finalBoxes)}
                className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80 transition-opacity"
                style={{ borderColor: '#a855f7', color: '#a855f7' }}
              >
                [ ACCEPT & EXIT MATRIX ]
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Simsense Overload Modal ──────────────────────────────────────────────────

function SimsenseOverloadModal({ level, willpower, onResult }: {
  level: DmgLevel;
  willpower: number;
  onResult: (failed: boolean) => void;
}) {
  const [rolled, setRolled] = useState(false);
  const [roll, setRoll] = useState<import('@/types').DiceRoll | null>(null);
  const tn = SIMSENSE_OVERLOAD_TN[level];
  const levelLabel: Record<DmgLevel, string> = { L: 'Light', M: 'Moderate', S: 'Serious', D: 'Deadly' };

  function handleRoll() {
    const r = rollDice(willpower, tn, `Willpower (${willpower}) vs TN ${tn}`);
    setRoll(r);
    setRolled(true);
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}>
      <div
        className="flex flex-col gap-0 border font-mono text-[13px] overflow-y-auto"
        style={{ width: 420, maxHeight: '80vh', borderColor: '#f97316', backgroundColor: 'var(--color-card)', boxShadow: '0 0 20px #f9731644' }}
      >
        <div className="px-4 py-2 border-b text-[14px] font-bold tracking-widest" style={{ borderColor: '#f97316', color: '#f97316' }}>
          SIMSENSE OVERLOAD
        </div>
        <div className="p-4 flex flex-col gap-3">
          <div className="text-[12px] text-[var(--color-muted-foreground)]">
            Icon took {levelLabel[level]} damage from white/gray IC. ASIST resonance may cause physical stun. Roll Willpower — failure = 1 Stun box.
          </div>
          <div className="flex flex-col gap-1 border border-[var(--color-border)] p-2">
            <InfoRow2 label="Damage level" value={levelLabel[level]} />
            <InfoRow2 label="Willpower TN" value={String(tn)} highlight />
            <InfoRow2 label="Willpower dice" value={String(willpower)} />
          </div>

          {!rolled && (
            <button
              onClick={handleRoll}
              className="w-full py-2 border font-bold tracking-widest text-[13px] hover:bg-[#f97316]/10 transition-colors"
              style={{ borderColor: '#f97316', color: '#f97316' }}
            >
              [ ROLL WILLPOWER TEST ]
            </button>
          )}

          {rolled && roll && (
            <>
              <div className="border border-[var(--color-border)] p-2">
                <div className="text-[11px] text-[var(--color-muted-foreground)] mb-1">Willpower ({willpower}) vs TN {tn}</div>
                <div className="flex flex-wrap gap-1 my-1">
                  {roll.dice.map((d, i) => {
                    const hit = d >= roll.targetNumber;
                    return (
                      <div key={i} className="w-7 h-7 flex items-center justify-center text-[13px] font-bold border"
                        style={{ borderColor: hit ? '#22c55e' : '#ef444466', color: hit ? '#22c55e' : '#ef4444', backgroundColor: hit ? '#22c55e18' : '#ef444410' }}>
                        {d}
                      </div>
                    );
                  })}
                </div>
                <div className="text-[12px]">
                  <span className="text-[var(--color-muted-foreground)]">Successes: </span>
                  <span className="font-bold" style={{ color: roll.successes > 0 ? '#22c55e' : '#ef4444' }}>{roll.successes}</span>
                </div>
              </div>
              {roll.successes >= 1 ? (
                <>
                  <div className="border p-2 text-center font-bold" style={{ borderColor: '#22c55e', color: '#22c55e' }}>
                    WILLPOWER HOLDS — No stun
                  </div>
                  <button onClick={() => onResult(false)}
                    className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                    style={{ borderColor: '#22c55e', color: '#22c55e' }}>
                    [ CONTINUE ]
                  </button>
                </>
              ) : (
                <>
                  <div className="border p-2 text-center font-bold" style={{ borderColor: '#f97316', color: '#f97316' }}>
                    OVERLOAD — Light Stun Wound (+1 Stun box)
                  </div>
                  <button onClick={() => onResult(true)}
                    className="w-full py-2 border font-bold tracking-widest text-[13px] hover:opacity-80"
                    style={{ borderColor: '#f97316', color: '#f97316' }}>
                    [ ACCEPT STUN & CONTINUE ]
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Shared InfoRow for modals
function InfoRow2({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-[var(--color-muted-foreground)]">{label}</span>
      <span className="font-bold" style={{ color: highlight ? 'var(--color-primary)' : 'var(--color-foreground)' }}>{value}</span>
    </div>
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
        <div className="text-[11px] tracking-widest uppercase text-[var(--color-muted-foreground)]">{title}</div>
        {subtitle && (
          <div className="text-[11px] text-[var(--color-foreground)] opacity-60 truncate">{subtitle}</div>
        )}
      </div>
      {children}
    </div>
  );
}
