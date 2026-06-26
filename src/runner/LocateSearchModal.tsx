import { useState, useMemo } from 'react';
import { rollDice } from '@/engine/diceEngine';
import type {
  HostFile, HostSlave, Host, CharacterSheet, RunnerSession, DiceRoll,
} from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LocateSearchResult {
  locatedIds: string[];
  tallyChange: number;
  log: string;
}

interface LocateSearchModalProps {
  mode: 'file' | 'slave';
  host: Host;
  character: CharacterSheet;
  session: RunnerSession;
  hackingPoolAvailable: number;
  alreadyLocatedIds: string[];
  onResult: (result: LocateSearchResult) => void;
  onClose: () => void;
}

// ─── Keyword matching ─────────────────────────────────────────────────────────

function scoreFile(keywords: string[], file: HostFile): number {
  if (keywords.length === 0) return 0;
  const haystack = [file.name, file.description, file.gmNotes ?? ''].join(' ').toLowerCase();
  return keywords.filter(kw => haystack.includes(kw)).length;
}

function scoreSlave(keywords: string[], slave: HostSlave): number {
  if (keywords.length === 0) return 0;
  const haystack = [
    slave.name, slave.type, slave.description, slave.controlEffect, slave.gmNotes ?? '',
  ].join(' ').toLowerCase();
  return keywords.filter(kw => haystack.includes(kw)).length;
}

/** TN modifier from maximum keyword match score across all items */
function fuzzyModFromScore(maxScore: number): number {
  if (maxScore === 0) return 2;   // very vague — no idea what they're looking for
  if (maxScore <= 2)  return 1;   // vague
  if (maxScore <= 4)  return 0;   // standard
  if (maxScore <= 6)  return -1;  // specific
  return -2;                       // very specific
}

function fuzzyLabel(mod: number): string {
  if (mod >=  2) return 'Very Vague (+2 TN)';
  if (mod >=  1) return 'Vague (+1 TN)';
  if (mod ===  0) return 'Standard';
  if (mod === -1) return 'Specific (−1 TN)';
  return 'Very Specific (−2 TN)';
}

// ─── Subsystem TN helpers ─────────────────────────────────────────────────────

function getBaseTN(host: Host, mode: 'file' | 'slave', session: RunnerSession): number {
  const sub = mode === 'file' ? host.subsystems.files : host.subsystems.slave;
  const woundMod = (() => {
    const b = session.personaBoxes ?? 0;
    if (b >= 7) return 3;
    if (b >= 4) return 2;
    if (b >= 1) return 1;
    return 0;
  })();
  // Utility reduction: Browse for files, Spoof for slaves
  const utilityName = mode === 'file' ? 'browse' : 'spoof';
  const utility = session.loadedPrograms.find(p => p.name.toLowerCase() === utilityName && p.loaded);
  const utilityRed = utility?.rating ?? 0;
  return Math.max(2, sub + woundMod - utilityRed);
}

// ─── Phase types ──────────────────────────────────────────────────────────────

type Phase = 'keywords' | 'roll' | 'results';

// ─── Component ────────────────────────────────────────────────────────────────

export function LocateSearchModal({
  mode, host, character, session, hackingPoolAvailable,
  alreadyLocatedIds, onResult, onClose,
}: LocateSearchModalProps) {
  const [phase, setPhase] = useState<Phase>('keywords');
  const [keywordInput, setKeywordInput] = useState('');
  const [poolDice, setPoolDice] = useState(0);
  const [rollResult, setRollResult] = useState<{
    deckerRoll: DiceRoll;
    hostRoll: DiceRoll;
    netSuccesses: number;
    locatedIds: string[];
    tallyChange: number;
    log: string;
  } | null>(null);

  const keywords = useMemo(
    () => keywordInput.trim().toLowerCase().split(/\s+/).filter(k => k.length > 0),
    [keywordInput],
  );

  const hiddenItems = useMemo(() => {
    if (mode === 'file') {
      return host.files.filter(f => !alreadyLocatedIds.includes(f.id));
    } else {
      return host.slaves.filter(s => !alreadyLocatedIds.includes(s.id));
    }
  }, [mode, host, alreadyLocatedIds]);

  const scores = useMemo(() => {
    if (mode === 'file') {
      return (hiddenItems as HostFile[]).map(f => ({
        id: f.id,
        score: scoreFile(keywords, f as HostFile),
      }));
    } else {
      return (hiddenItems as HostSlave[]).map(s => ({
        id: s.id,
        score: scoreSlave(keywords, s as HostSlave),
      }));
    }
  }, [keywords, hiddenItems, mode]);

  const maxScore = useMemo(() => Math.max(0, ...scores.map(s => s.score)), [scores]);
  const matchCount = useMemo(() => scores.filter(s => s.score > 0).length, [scores]);
  const fuzzyMod = fuzzyModFromScore(maxScore);

  const baseTN = getBaseTN(host, mode, session);
  const finalTN = Math.max(2, baseTN + fuzzyMod);

  const computerDice = character.computerSkill;
  const totalDice = computerDice + poolDice;
  const label = mode === 'file' ? 'FILE' : 'SLAVE';

  function doRoll() {
    // Decker roll: Computer + pool vs finalTN
    const deckerRoll = rollDice(totalDice, finalTN, 'Decker Locate Search');
    // Host security test: SV vs Detection Factor
    const df = Math.ceil((session.loadedPrograms.find(p => p.name.toLowerCase() === 'masking' && p.loaded)?.rating ?? 0 +
      session.loadedPrograms.find(p => p.name.toLowerCase() === 'sleaze' && p.loaded)?.rating ?? 0) / 2) || 0;
    const securityTN = Math.max(2, host.securityValue - df);
    const hostRoll = rollDice(host.securityValue, securityTN, 'Host Security');
    const tallyChange = hostRoll.successes;

    const netSuccesses = deckerRoll.successes - hostRoll.successes;

    let locatedIds: string[] = [];
    let logMsg = '';

    if (netSuccesses > 0) {
      // Sort matched items by score descending, then slice by net successes
      const ranked = scores
        .filter(s => s.score > 0)
        .sort((a, b) => b.score - a.score);

      if (ranked.length > 0) {
        // Reveal top-N matched items (N = net successes, min 1)
        locatedIds = ranked.slice(0, netSuccesses).map(s => s.id);
        logMsg = `Found ${locatedIds.length} ${label.toLowerCase()}(s) matching keywords. Tally +${tallyChange}.`;
      } else {
        // No keyword matches: reveal random unlocated items
        const shuffled = [...hiddenItems].sort(() => Math.random() - 0.5);
        locatedIds = shuffled.slice(0, netSuccesses).map(s => s.id);
        logMsg = locatedIds.length > 0
          ? `No keyword matches — found ${locatedIds.length} ${label.toLowerCase()}(s) randomly. Tally +${tallyChange}.`
          : `No ${label.toLowerCase()}s found. Tally +${tallyChange}.`;
      }
    } else {
      logMsg = `Search failed. Tally +${tallyChange}.`;
    }

    setRollResult({ deckerRoll, hostRoll, netSuccesses, locatedIds, tallyChange, log: logMsg });
    setPhase('results');
  }

  function handleApply() {
    if (!rollResult) return;
    onResult({
      locatedIds: rollResult.locatedIds,
      tallyChange: rollResult.tallyChange,
      log: rollResult.log,
    });
  }

  const titleColor = mode === 'file' ? 'text-cyan-400' : 'text-violet-400';
  const borderColor = mode === 'file' ? 'border-cyan-800' : 'border-violet-800';
  const accentBg = mode === 'file' ? 'bg-cyan-900/40' : 'bg-violet-900/40';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className={`bg-gray-950 border ${borderColor} rounded-lg w-full max-w-lg text-gray-100`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${borderColor}`}>
          <span className={`font-mono font-bold text-base tracking-widest ${titleColor}`}>
            LOCATE {label}
          </span>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">

          {/* ── Phase 1: Keyword entry ── */}
          {phase === 'keywords' && (
            <>
              <p className="text-gray-400 text-sm font-mono">
                Enter search keywords. More precise keywords reduce the Target Number.
              </p>

              <div className="space-y-2">
                <label className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                  Keywords
                </label>
                <input
                  type="text"
                  value={keywordInput}
                  onChange={e => setKeywordInput(e.target.value)}
                  placeholder="e.g. backdoor corner office 1st floor"
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm font-mono text-gray-100 focus:outline-none focus:border-cyan-600"
                  autoFocus
                />
                <p className="text-xs text-gray-600 font-mono">
                  Space-separated. Matched against item names and descriptions.
                </p>
              </div>

              {/* Match preview */}
              <div className={`rounded p-3 ${accentBg} border ${borderColor} space-y-1`}>
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Items in host:</span>
                  <span className="text-gray-200">{hiddenItems.length}</span>
                </div>
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Keyword matches:</span>
                  <span className={matchCount > 0 ? 'text-green-400' : 'text-gray-500'}>
                    {keywords.length === 0 ? '—' : matchCount}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Precision:</span>
                  <span className={
                    fuzzyMod < 0 ? 'text-green-400' :
                    fuzzyMod === 0 ? 'text-gray-200' :
                    'text-yellow-400'
                  }>
                    {fuzzyLabel(fuzzyMod)}
                  </span>
                </div>
                <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between font-mono text-sm font-bold">
                  <span className="text-gray-300">Target Number:</span>
                  <span className="text-white">{finalTN}</span>
                </div>
              </div>

              <div className="text-xs font-mono text-gray-600 space-y-0.5">
                <div>Base TN: {mode === 'file' ? host.subsystems.files : host.subsystems.slave} (Files subsystem)</div>
                <div>Fuzzy modifier: {fuzzyMod >= 0 ? '+' : ''}{fuzzyMod} → final TN {finalTN}</div>
              </div>

              <button
                onClick={() => setPhase('roll')}
                className={`w-full py-2 rounded font-mono font-bold text-sm tracking-wider ${
                  mode === 'file'
                    ? 'bg-cyan-700 hover:bg-cyan-600 text-white'
                    : 'bg-violet-700 hover:bg-violet-600 text-white'
                }`}
              >
                CONTINUE → SET POOL
              </button>
            </>
          )}

          {/* ── Phase 2: Pool allocation + roll ── */}
          {phase === 'roll' && (
            <>
              <div className={`rounded p-3 ${accentBg} border ${borderColor} space-y-1`}>
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Keywords:</span>
                  <span className="text-gray-300 truncate max-w-[60%] text-right">
                    {keywordInput.trim() || '(none)'}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Precision:</span>
                  <span className={fuzzyMod < 0 ? 'text-green-400' : fuzzyMod === 0 ? 'text-gray-200' : 'text-yellow-400'}>
                    {fuzzyLabel(fuzzyMod)}
                  </span>
                </div>
                <div className="flex justify-between font-mono text-sm font-bold">
                  <span className="text-gray-300">Target Number:</span>
                  <span className="text-white">{finalTN}</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Computer skill:</span>
                  <span className="text-gray-200">{computerDice}d</span>
                </div>
                <div className="flex justify-between font-mono text-sm">
                  <span className="text-gray-400">Hacking pool available:</span>
                  <span className="text-gray-200">{hackingPoolAvailable}d</span>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-mono text-gray-500 uppercase tracking-wider">
                    Pool dice to add: {poolDice}
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={hackingPoolAvailable}
                    value={poolDice}
                    onChange={e => setPoolDice(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="text-center font-mono text-lg font-bold text-white">
                  {totalDice}d vs TN {finalTN}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setPhase('keywords')}
                  className="flex-1 py-2 rounded font-mono text-sm border border-gray-700 text-gray-400 hover:text-gray-200"
                >
                  ← BACK
                </button>
                <button
                  onClick={doRoll}
                  className={`flex-1 py-2 rounded font-mono font-bold text-sm tracking-wider ${
                    mode === 'file'
                      ? 'bg-cyan-700 hover:bg-cyan-600 text-white'
                      : 'bg-violet-700 hover:bg-violet-600 text-white'
                  }`}
                >
                  ROLL SEARCH
                </button>
              </div>
            </>
          )}

          {/* ── Phase 3: Results ── */}
          {phase === 'results' && rollResult && (
            <>
              {/* Rolls */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-900 rounded p-3">
                  <div className="text-xs font-mono text-gray-500 uppercase mb-1">Decker</div>
                  <div className="font-mono text-sm text-gray-300">
                    [{rollResult.deckerRoll.dice.join(', ')}]
                  </div>
                  <div className="font-mono text-sm font-bold text-white mt-1">
                    {rollResult.deckerRoll.successes} hit{rollResult.deckerRoll.successes !== 1 ? 's' : ''}
                    <span className="text-gray-500 font-normal"> vs TN {finalTN}</span>
                  </div>
                </div>
                <div className="bg-gray-900 rounded p-3">
                  <div className="text-xs font-mono text-gray-500 uppercase mb-1">Host Security</div>
                  <div className="font-mono text-sm text-gray-300">
                    [{rollResult.hostRoll.dice.join(', ')}]
                  </div>
                  <div className="font-mono text-sm font-bold text-white mt-1">
                    {rollResult.hostRoll.successes} hit{rollResult.hostRoll.successes !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {/* Net result */}
              <div className={`rounded p-3 text-center ${
                rollResult.netSuccesses > 0 ? 'bg-green-900/30 border border-green-800' : 'bg-red-900/30 border border-red-900'
              }`}>
                <div className="font-mono text-xs text-gray-400 uppercase mb-1">Net Successes</div>
                <div className={`font-mono text-2xl font-bold ${rollResult.netSuccesses > 0 ? 'text-green-300' : 'text-red-400'}`}>
                  {rollResult.netSuccesses > 0 ? `+${rollResult.netSuccesses}` : rollResult.netSuccesses}
                </div>
              </div>

              {/* Found items */}
              {rollResult.locatedIds.length > 0 ? (
                <div className="space-y-1">
                  <div className="text-xs font-mono text-gray-400 uppercase tracking-wider">
                    Located {label.toLowerCase()}s ({rollResult.locatedIds.length}):
                  </div>
                  {rollResult.locatedIds.map(id => {
                    const item = mode === 'file'
                      ? host.files.find(f => f.id === id)
                      : host.slaves.find(s => s.id === id);
                    return (
                      <div key={id} className={`rounded px-3 py-2 ${accentBg} border ${borderColor} font-mono text-sm`}>
                        <span className={titleColor}>{item?.name ?? id}</span>
                        {item && 'description' in item && (
                          <span className="text-gray-400 ml-2 text-xs">{(item as HostFile | HostSlave).description}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center font-mono text-sm text-red-400 py-2">
                  Search failed — no {label.toLowerCase()}s located.
                </div>
              )}

              {/* Tally */}
              {rollResult.tallyChange > 0 && (
                <div className="text-center font-mono text-xs text-yellow-500">
                  Security tally +{rollResult.tallyChange}
                </div>
              )}

              <button
                onClick={handleApply}
                className={`w-full py-2 rounded font-mono font-bold text-sm tracking-wider ${
                  mode === 'file'
                    ? 'bg-cyan-700 hover:bg-cyan-600 text-white'
                    : 'bg-violet-700 hover:bg-violet-600 text-white'
                }`}
              >
                APPLY & CLOSE
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
