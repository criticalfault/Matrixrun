import { rollDice } from '@/engine/diceEngine';
import { OPERATION_DEFINITIONS } from '@/data/srTables';
import type { RunnerSession, Program, Host, ICInstance, AlertLevel } from '@/types';

export function calcDetectionFactor(session: RunnerSession): number {
  const masking = session.character.deck.masking - session.personaCondition.masking;
  const effectiveMasking = Math.max(1, masking);
  const sleaze = session.loadedPrograms.find(p => p.loaded && p.name.toLowerCase().includes('sleaze'));
  const sleazeRating = sleaze?.rating ?? 0;
  const base = Math.ceil((effectiveMasking + sleazeRating) / 2);
  const suppressPenalty = (session.suppressedIC ?? []).length;
  return Math.max(1, base - suppressPenalty);
}

/**
 * Find the operational utility for this operation, then check if the decker
 * has a loaded copy. Returns TN reduction = utility rating, or 0 if not loaded.
 */
export function getProgramTNReduction(opKey: string, programs: Program[]): { reduction: number; label: string } {
  const op = OPERATION_DEFINITIONS[opKey];
  if (!op?.utility) return { reduction: 0, label: '' };

  const utilName = op.utility.toLowerCase();
  const prog = programs.find(p => p.loaded && p.name.toLowerCase() === utilName);
  if (!prog) return { reduction: 0, label: '' };

  return { reduction: prog.rating, label: `${prog.name} -${prog.rating}` };
}

/**
 * Check the security sheaf for steps that are newly crossed by a tally change.
 * Returns all IC instances to activate and any alert level upgrade.
 * Only fires steps in the range (oldTally, newTally] — won't re-fire already-passed steps.
 */
export interface SheafFireResult {
  ics: ICInstance[];
  alertChange: AlertLevel | null;
  stepLogs: string[];
}

export function checkSheafTriggers(
  host: Host,
  oldTally: number,
  newTally: number,
): SheafFireResult {
  const result: SheafFireResult = { ics: [], alertChange: null, stepLogs: [] };

  const firedSteps = (host.securitySheaf ?? [])
    .filter(step => step.triggerValue > oldTally && step.triggerValue <= newTally)
    .sort((a, b) => a.triggerValue - b.triggerValue);

  for (const step of firedSteps) {
    // Clone each IC with runtime status set to active
    for (const ic of step.ic ?? []) {
      result.ics.push({ ...ic, status: 'active', currentRating: ic.currentRating ?? ic.rating });
    }
    if (step.alertChange) {
      result.alertChange = step.alertChange;
    }
    const icList = (step.ic ?? []).map(ic => ic.type).join(', ') || 'no IC';
    const alertNote = step.alertChange ? ` | ALERT → ${step.alertChange.toUpperCase()}` : '';
    result.stepLogs.push(`Tally ${step.triggerValue}: ${icList}${alertNote}`);
  }

  return result;
}

/**
 * Auto-roll Host Security Test and return tally gained.
 * Returns { hostSuccesses, secRoll }.
 */
export function rollHostSecurityTest(
  session: RunnerSession,
  securityValue: number,
): { hostSuccesses: number; secRoll: ReturnType<typeof rollDice> } {
  const df = calcDetectionFactor(session);
  const secRoll = rollDice(securityValue, df, `Host Security Test (SV ${securityValue} vs DF ${df})`);
  return { hostSuccesses: secRoll.successes, secRoll };
}
