import type { DiceRoll, TestResult } from '@/types';

/**
 * Roll a single die with Rule of Six applied.
 * If the result is 6 and TN > 6, keep rolling and accumulating until total >= TN or a non-6 lands.
 * Returns the final effective value for that die position.
 * Set applyRuleOfSix=false for Initiative Tests.
 */
function rollOneDie(targetNumber: number, applyRuleOfSix = true): number {
  const raw = Math.floor(Math.random() * 6) + 1;
  if (!applyRuleOfSix || targetNumber <= 6 || raw !== 6) return raw;

  // Rule of Six: accumulate 6 + re-rolls until total >= TN or non-6 rolled
  let total = 6;
  while (total < targetNumber) {
    const reroll = Math.floor(Math.random() * 6) + 1;
    total += reroll;
    if (reroll !== 6) break;
  }
  return total;
}

/**
 * Roll N dice against a target number.
 *
 * Rule of Six: if TN > 6, any die showing 6 is re-rolled and added until >= TN.
 *   Does NOT apply to Initiative Tests.
 *
 * Rule of One:
 *   - A die showing 1 is simply a failure for that die (no successes from it).
 *   - If ALL dice come up 1s, it is a catastrophic failure (glitch) regardless
 *     of whether any "accumulated" die values could have succeeded.
 */
export function rollDice(
  count: number,
  targetNumber: number,
  label: string,
  applyRuleOfSix = true,
): DiceRoll {
  const dice: number[] = [];
  for (let i = 0; i < count; i++) {
    dice.push(rollOneDie(targetNumber, applyRuleOfSix));
  }

  // A raw 1 on the first roll is the Rule of One die — stored values > 6 came from Rule of Six
  // re-rolls. We need to track which dice started as 1s before accumulation.
  // Since rollOneDie only accumulates when raw===6, any value of 1 in dice[] was truly a 1.
  const ones = dice.filter(d => d === 1).length;
  const successes = dice.filter(d => d >= targetNumber).length;

  // Catastrophic failure: every single die came up 1 (no re-roll possible from a 1)
  const isCatastrophic = ones === count;

  return { dice, targetNumber, successes, label, isCatastrophic };
}

/**
 * An opposed test: attacker rolls, defender rolls, net successes determine outcome.
 * Returns the attacker's net successes (can be negative if defender wins).
 */
export function opposedTest(
  attackerDice: number,
  attackerTN: number,
  attackerLabel: string,
  defenderDice: number,
  defenderTN: number,
  defenderLabel: string,
): TestResult {
  const attackRoll = rollDice(attackerDice, attackerTN, attackerLabel);
  const defenseRoll = rollDice(defenderDice, defenderTN, `${defenderLabel} (opposing)`);
  defenseRoll.isOpposing = true;

  const isCatastrophic = attackRoll.isCatastrophic;
  const netSuccesses = isCatastrophic ? -1 : attackRoll.successes - defenseRoll.successes;
  const success = netSuccesses > 0;

  const narrative = isCatastrophic
    ? `${attackerLabel}: CATASTROPHIC FAILURE — all dice showed 1s!`
    : success
      ? `${attackerLabel}: ${attackRoll.successes} successes vs ${defenseRoll.successes} — net ${netSuccesses} success${netSuccesses !== 1 ? 'es' : ''}.`
      : netSuccesses === 0
        ? `${attackerLabel}: Tied (${attackRoll.successes} vs ${defenseRoll.successes}) — attacker fails.`
        : `${defenderLabel}: ${defenseRoll.successes} successes vs ${attackRoll.successes} — defended.`;

  return {
    rolls: [attackRoll, defenseRoll],
    netSuccesses,
    success,
    narrative,
    tallyChange: 0,
    isCatastrophic,
  };
}

/**
 * A simple uncontested test: roll dice against a target number.
 */
export function simpleTest(
  diceCount: number,
  targetNumber: number,
  label: string,
  requiredSuccesses = 1,
): TestResult {
  const roll = rollDice(diceCount, targetNumber, label);
  const success = roll.successes >= requiredSuccesses && !roll.isCatastrophic;

  const narrative = roll.isCatastrophic
    ? `${label}: CATASTROPHIC FAILURE — all dice showed 1s!`
    : success
      ? `${label}: ${roll.successes} success${roll.successes !== 1 ? 'es' : ''} (needed ${requiredSuccesses}).`
      : `${label}: ${roll.successes} success${roll.successes !== 1 ? 'es' : ''} — failed (needed ${requiredSuccesses}).`;

  return {
    rolls: [roll],
    netSuccesses: roll.isCatastrophic ? -1 : roll.successes,
    success,
    narrative,
    tallyChange: 0,
    isCatastrophic: roll.isCatastrophic,
  };
}

/**
 * Clamp a target number to the SR3 minimum of 2.
 */
export function clampTN(tn: number): number {
  return Math.max(2, tn);
}

/**
 * Format dice array for display: [6, 2, 5, 1, 4, 6] → "6 2 5 1 4 6"
 * Highlights successes and 1s.
 */
export function formatDice(dice: number[]): string {
  return dice.map(d => String(d)).join(' ');
}

/**
 * Calculate Matrix initiative: Reaction + 1D6 (+ bonuses)
 */
// Initiative: Rule of Six does NOT apply (SR3 p.XX)
export function rollInitiative(reaction: number, bonus = 0): { total: number; die: number } {
  const die = Math.floor(Math.random() * 6) + 1;
  return { total: reaction + die + bonus, die };
}
