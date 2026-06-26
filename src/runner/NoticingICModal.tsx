import { useState } from 'react';
import { rollDice } from '@/engine/diceEngine';
import type { ICInstance, DiceRoll } from '@/types';
import { IC_DEFINITIONS, IC_CATEGORY_COLOR } from '@/data/srTables';

interface NoticingICModalProps {
  ic: ICInstance;
  sensorsDice: number;       // decker's effective Sensors rating
  onResult: (noticed: boolean, roll: DiceRoll) => void;
}

export function NoticingICModal({ ic, sensorsDice, onResult }: NoticingICModalProps) {
  const [roll, setRoll] = useState<DiceRoll | null>(null);
  const tn = ic.currentRating;
  const def = IC_DEFINITIONS[ic.type];
  const catColor = IC_CATEGORY_COLOR[ic.category] ?? '#9ca3af';

  function doRoll() {
    const r = rollDice(sensorsDice, tn, `Sensors vs IC rating ${tn}`);
    setRoll(r);
  }

  const noticed = roll ? roll.successes >= 1 : null;

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-950 border border-yellow-800 rounded-lg w-full max-w-sm text-gray-100">
        <div className="flex items-center justify-between px-5 py-3 border-b border-yellow-800">
          <span className="font-mono font-bold text-base tracking-widest text-yellow-400">
            IC DETECTED
          </span>
          <span className="font-mono text-xs text-gray-500 uppercase tracking-wider">noticing test</span>
        </div>

        <div className="p-5 space-y-4">
          {/* IC info */}
          <div className="bg-gray-900 rounded p-3 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm" style={{ color: catColor }}>
                {def?.label ?? ic.type}
              </span>
              <span className="font-mono text-xs text-gray-400">rating {ic.currentRating}</span>
            </div>
            <div className="font-mono text-xs text-gray-500 uppercase tracking-wider">{ic.category}</div>
          </div>

          <p className="text-sm font-mono text-gray-400">
            IC is activating and targeting you. Roll <span className="text-white">Sensors</span> vs
            TN <span className="text-white">{tn}</span> (IC rating) to notice it.
          </p>

          <div className="text-center font-mono text-sm text-gray-300">
            {sensorsDice}d vs TN {tn}
          </div>

          {!roll && (
            <button
              onClick={doRoll}
              className="w-full py-2 rounded font-mono font-bold text-sm tracking-wider bg-yellow-700 hover:bg-yellow-600 text-white"
            >
              ROLL SENSORS
            </button>
          )}

          {roll && (
            <>
              <div className="bg-gray-900 rounded p-3 text-center">
                <div className="font-mono text-xs text-gray-500 uppercase mb-1">Dice</div>
                <div className="font-mono text-sm text-gray-300">[{roll.dice.join(', ')}]</div>
                <div className="font-mono text-lg font-bold text-white mt-1">
                  {roll.successes} hit{roll.successes !== 1 ? 's' : ''} vs TN {tn}
                </div>
              </div>

              <div className={`rounded p-3 text-center border ${
                noticed ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-900'
              }`}>
                <div className={`font-mono font-bold text-base ${noticed ? 'text-green-300' : 'text-red-400'}`}>
                  {noticed ? 'IC NOTICED' : 'IC UNNOTICED'}
                </div>
                <div className="font-mono text-xs text-gray-400 mt-1">
                  {noticed
                    ? 'Decker is aware of the IC — can act against it immediately.'
                    : 'IC acts first — it may get a free action before the decker can respond.'}
                </div>
              </div>

              <button
                onClick={() => onResult(noticed!, roll)}
                className="w-full py-2 rounded font-mono font-bold text-sm tracking-wider bg-gray-700 hover:bg-gray-600 text-white"
              >
                CONTINUE
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
