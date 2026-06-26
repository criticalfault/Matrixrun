import { useState } from 'react';
import { useRunner } from './runnerContext';
import { Button } from '@/components/ui/button';

export interface PoolRollRequest {
  label: string;           // e.g. "Locate File — Index TN 8"
  baseDice: number;        // dice from skill before pool
  targetNumber: number;
  requiredSuccesses?: number;
  onConfirm: (poolDiceAdded: number) => void;
  onCancel?: () => void;
}

interface Props {
  request: PoolRollRequest;
}

export default function HackingPoolModal({ request }: Props) {
  const { session, hackingPoolAvailable } = useRunner();
  const [poolAdd, setPoolAdd] = useState(0);

  const totalDice = request.baseDice + poolAdd;
  const available = hackingPoolAvailable;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
      <div
        className="bg-[var(--color-card)] border font-mono w-[420px]"
        style={{ borderColor: 'var(--color-primary)', boxShadow: '0 0 24px var(--color-primary)33' }}
      >
        {/* Header */}
        <div className="px-4 py-2 border-b border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5">
          <div className="text-[11px] uppercase tracking-widest text-[var(--color-muted-foreground)]">Matrix Roll</div>
          <div className="text-sm font-bold text-[var(--color-primary)] mt-0.5">{request.label}</div>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {/* Roll summary */}
          <div className="grid grid-cols-3 gap-2 text-center">
            <StatBox label="Base Dice" value={request.baseDice} />
            <StatBox label="TN" value={request.targetNumber} highlight />
            <StatBox label="Needed" value={request.requiredSuccesses ?? 1} />
          </div>

          {/* Pool allocation */}
          <div className="border border-[var(--color-border)] p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[12px]">
              <span className="uppercase tracking-wider text-[var(--color-muted-foreground)]">Hacking Pool</span>
              <span>
                <span className="text-[var(--color-primary)] font-bold">{available}</span>
                <span className="text-[var(--color-muted-foreground)]"> / {session.hackingPoolTotal} available</span>
                {session.hackingPoolUsed > 0 && (
                  <span className="text-[var(--color-alert-passive)] ml-2">({session.hackingPoolUsed} spent this turn)</span>
                )}
              </span>
            </div>

            {available > 0 ? (
              <>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={available}
                    value={poolAdd}
                    onChange={e => setPoolAdd(parseInt(e.target.value))}
                    className="flex-1 accent-[var(--color-primary)]"
                  />
                  <span className="w-6 text-right font-bold text-[var(--color-primary)] text-sm">
                    +{poolAdd}
                  </span>
                </div>
                {/* Quick-pick buttons */}
                <div className="flex gap-1">
                  {[0, Math.floor(available / 3), Math.floor(available / 2), available].filter((v, i, a) => a.indexOf(v) === i).map(v => (
                    <button
                      key={v}
                      onClick={() => setPoolAdd(v)}
                      className="flex-1 text-[11px] border py-0.5 uppercase tracking-wider transition-colors"
                      style={{
                        borderColor: poolAdd === v ? 'var(--color-primary)' : 'var(--color-border)',
                        color: poolAdd === v ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
                        backgroundColor: poolAdd === v ? 'var(--color-primary)15' : 'transparent',
                      }}
                    >
                      {v === 0 ? 'None' : v === available ? 'All' : v}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-[12px] text-[var(--color-alert-active)] py-1">
                Hacking Pool exhausted this Combat Turn — rolling base dice only.
              </div>
            )}
          </div>

          {/* Total dice summary */}
          <div
            className="flex items-center justify-between px-3 py-2 border text-sm"
            style={{ borderColor: 'var(--color-primary)44', backgroundColor: 'var(--color-primary)08' }}
          >
            <span className="text-[12px] uppercase tracking-wider text-[var(--color-muted-foreground)]">Rolling</span>
            <span>
              <span className="font-bold text-[var(--color-primary)] text-lg">{totalDice}</span>
              <span className="text-[var(--color-muted-foreground)] text-[13px] ml-1">
                dice vs TN {request.targetNumber}
                {request.baseDice > 0 && poolAdd > 0 && (
                  <span className="opacity-50 ml-1">({request.baseDice} + {poolAdd} pool)</span>
                )}
              </span>
            </span>
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            {request.onCancel && (
              <Button variant="ghost" onClick={request.onCancel}>Cancel</Button>
            )}
            <Button onClick={() => request.onConfirm(poolAdd)}>
              Roll {totalDice}d6
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className="border py-2 flex flex-col items-center gap-0.5"
      style={{ borderColor: highlight ? 'var(--color-accent)44' : 'var(--color-border)' }}
    >
      <span className="text-[11px] uppercase tracking-wider text-[var(--color-muted-foreground)]">{label}</span>
      <span
        className="text-xl font-bold"
        style={{ color: highlight ? 'var(--color-accent)' : 'var(--color-foreground)' }}
      >
        {value}
      </span>
    </div>
  );
}
