import { useState, useCallback } from 'react';
import type { PoolRollRequest } from './HackingPoolModal';
import { useRunner } from './runnerContext';
import { rollDice } from '@/engine/diceEngine';
import type { TestResult } from '@/types';

/**
 * Returns a `requestRoll` function and the current pending modal request.
 *
 * Usage:
 *   const { pendingRoll, requestRoll } = usePoolRoll();
 *   // render: pendingRoll && <HackingPoolModal request={pendingRoll} />
 *   // call:   const result = await requestRoll({ label, baseDice, targetNumber });
 */
export function usePoolRoll() {
  const { dispatch } = useRunner();
  const [pendingRoll, setPendingRoll] = useState<PoolRollRequest | null>(null);

  const requestRoll = useCallback((
    opts: Omit<PoolRollRequest, 'onConfirm' | 'onCancel'> & { cancelable?: boolean },
  ): Promise<TestResult | null> => {
    return new Promise(resolve => {
      setPendingRoll({
        ...opts,
        onConfirm: (poolDiceAdded) => {
          setPendingRoll(null);
          // Spend the pool dice
          if (poolDiceAdded > 0) {
            dispatch({ type: 'SPEND_POOL', payload: poolDiceAdded });
          }
          // Execute the roll
          const totalDice = opts.baseDice + poolDiceAdded;
          const roll = rollDice(totalDice, opts.targetNumber, opts.label);
          const success = roll.successes >= (opts.requiredSuccesses ?? 1) && !roll.isCatastrophic;
          const result: TestResult = {
            rolls: [roll],
            netSuccesses: roll.isCatastrophic ? -1 : roll.successes,
            success,
            narrative: roll.isCatastrophic
              ? `${opts.label}: CATASTROPHIC — all dice showed 1s!`
              : success
                ? `${opts.label}: ${roll.successes} success${roll.successes !== 1 ? 'es' : ''}`
                : `${opts.label}: ${roll.successes} success${roll.successes !== 1 ? 'es' : ''} — failed`,
            tallyChange: 0,
            isCatastrophic: roll.isCatastrophic,
          };
          resolve(result);
        },
        onCancel: opts.cancelable ? () => {
          setPendingRoll(null);
          resolve(null);
        } : undefined,
      });
    });
  }, [dispatch]);

  return { pendingRoll, requestRoll };
}
