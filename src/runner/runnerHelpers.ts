import { rollDice } from '@/engine/diceEngine';
import { PROGRAM_OP_BONUS } from '@/data/srTables';
import type { RunnerSession, Program } from '@/types';

export function calcDetectionFactor(session: RunnerSession): number {
  const masking = session.character.deck.masking - session.personaCondition.masking;
  const effectiveMasking = Math.max(1, masking);
  const sleaze = session.loadedPrograms.find(p => p.loaded && p.name.toLowerCase().includes('sleaze'));
  const sleazeRating = sleaze?.rating ?? 0;
  const base = Math.ceil((effectiveMasking + sleazeRating) / 2);
  const suppressPenalty = (session.suppressedIC ?? []).length;
  return Math.max(1, base - suppressPenalty);
}

export function getProgramTNReduction(opKey: string, programs: Program[]): { reduction: number; label: string } {
  const loaded = programs.filter(p => p.loaded);
  let reduction = 0;
  const labels: string[] = [];
  for (const [progName, ops] of Object.entries(PROGRAM_OP_BONUS)) {
    if ((ops as string[]).includes(opKey)) {
      const prog = loaded.find(p => p.name.toLowerCase().includes(progName.toLowerCase()));
      if (prog) {
        reduction += prog.rating;
        labels.push(`${prog.name} -${prog.rating}`);
      }
    }
  }
  return { reduction, label: labels.join(', ') };
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
