import { useState } from 'react';
import { useBuilder, defaultSubsystems } from '@/builder/builderContext';
import { Input } from '@/components/ui/input';
import { SECURITY_CODE_COLORS, SECURITY_CODE_MAX_VALUE } from '@/data/srTables';
import { randomizeHost, randomizeByDifficulty } from '@/engine/randomizeHost';
import type { SecurityCode } from '@/types';

const SECURITY_CODES: SecurityCode[] = ['Blue', 'Green', 'Orange', 'Red', 'UV'];

export default function OverviewTab() {
  const { selectedHost, dispatch } = useBuilder();
  const [justRandomized, setJustRandomized] = useState(false);
  if (!selectedHost) return null;

  const h = selectedHost;

  function handleRandomize() {
    const patch = randomizeHost(h);
    dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, ...patch } });
    setJustRandomized(true);
    setTimeout(() => setJustRandomized(false), 1200);
  }

  function setSecCode(code: SecurityCode) {
    dispatch({
      type: 'UPDATE_HOST',
      payload: {
        id: h.id,
        securityCode: code,
        securityValue: Math.min(h.securityValue, SECURITY_CODE_MAX_VALUE[code]),
        subsystems: defaultSubsystems(code),
      },
    });
  }

  const secColor = SECURITY_CODE_COLORS[h.securityCode];

  return (
    <div className="flex flex-col text-xs font-mono overflow-y-auto">
      {/* Quick Setup banner */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-secondary)]">
        <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]">
          Quick Setup
        </span>
        <div className="flex items-center gap-2">
          {/* Intrusion Difficulty */}
          {(['Easy','Average','Hard'] as const).map(diff => {
            const diffColor = diff === 'Easy' ? '#22c55e' : diff === 'Average' ? '#f97316' : '#ef4444';
            const isActive = h.intrusionDifficulty === diff;
            return (
              <button
                key={diff}
                onClick={() => {
                  const patch = randomizeByDifficulty(h, diff);
                  dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, ...patch } });
                }}
                className="text-[10px] border px-2 py-0.5 font-mono uppercase tracking-wider transition-colors"
                style={{
                  borderColor: isActive ? diffColor : 'var(--color-border)',
                  color: isActive ? diffColor : 'var(--color-muted-foreground)',
                  backgroundColor: isActive ? `${diffColor}15` : 'transparent',
                }}
                title={`Randomize as ${diff} intrusion difficulty`}
              >
                {diff}
              </button>
            );
          })}
          <span className="text-[var(--color-border)] text-[10px]">|</span>
          <button
            onClick={handleRandomize}
            className="flex items-center gap-1.5 text-[10px] border px-2 py-0.5 font-mono uppercase tracking-wider transition-all"
            style={{
              borderColor: justRandomized ? 'var(--color-primary)' : 'var(--color-border)',
              color: justRandomized ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
              backgroundColor: justRandomized ? 'var(--color-primary)15' : 'transparent',
            }}
            title={`Randomize ratings + security sheaf for a ${h.securityCode} host`}
          >
            <span>{justRandomized ? '✓' : '⚄'}</span>
            <span>{justRandomized ? 'Randomized!' : `Randomize ${h.securityCode} Host`}</span>
            {!justRandomized && (
              <span className="opacity-40 normal-case tracking-normal" style={{ fontSize: 9 }}>
                ratings · sheaf · paydata
              </span>
            )}
          </button>
        </div>
      </div>

    <div className="grid grid-cols-2 gap-4 p-3">
      {/* Left column — identity */}
      <div className="flex flex-col gap-3">
        <Field label="Host Name">
          <Input
            value={h.name}
            onChange={e => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, name: e.target.value } })}
            placeholder="e.g. Aztechnology Seattle Nexus"
          />
        </Field>
        <Field label="Description (shown to player)">
          <textarea
            value={h.description}
            onChange={e => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, description: e.target.value } })}
            placeholder="What the decker perceives when logged in..."
            rows={2}
            className="w-full bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-xs font-mono text-[var(--color-foreground)] placeholder:text-[var(--color-muted-foreground)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
          />
        </Field>
        <Field label="Metaphor / Sculpting">
          <Input
            value={h.metaphor ?? ''}
            onChange={e => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, metaphor: e.target.value } })}
            placeholder="e.g. Aztec pyramid, chrome corporate tower..."
          />
        </Field>
      </div>

      {/* Right column — security */}
      <div className="flex flex-col gap-3">
        {/* Security Code selector */}
        <Field label="Security Code">
          <div className="flex gap-1">
            {SECURITY_CODES.map(code => (
              <button
                key={code}
                onClick={() => setSecCode(code)}
                className="flex-1 py-1 border text-[10px] uppercase tracking-wider transition-colors"
                style={{
                  borderColor: h.securityCode === code ? SECURITY_CODE_COLORS[code] : 'var(--color-border)',
                  color: h.securityCode === code ? SECURITY_CODE_COLORS[code] : 'var(--color-muted-foreground)',
                  backgroundColor: h.securityCode === code ? `${SECURITY_CODE_COLORS[code]}15` : 'transparent',
                }}
              >
                {code === 'UV' ? 'UV' : code[0]}
              </button>
            ))}
          </div>
        </Field>

        {/* Security Value */}
        <Field label={`Security Value (1–${SECURITY_CODE_MAX_VALUE[h.securityCode]})`}>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={1}
              max={SECURITY_CODE_MAX_VALUE[h.securityCode]}
              value={h.securityValue}
              onChange={e => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, securityValue: parseInt(e.target.value) } })}
              className="flex-1 accent-[var(--color-primary)]"
            />
            <span className="w-6 text-right font-bold" style={{ color: secColor }}>{h.securityValue}</span>
          </div>
          <div className="text-[9px] opacity-40 mt-0.5">
            Full designation: <span style={{ color: secColor }}>{h.securityCode}-{h.securityValue}</span>
          </div>
        </Field>

        {/* Subsystem ratings */}
        <Field label="Subsystem Ratings">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {(['access', 'files', 'control', 'slave', 'index'] as const).map(sub => (
              <div key={sub} className="flex items-center gap-1">
                <span className="w-14 uppercase text-[9px] opacity-50 tracking-wider">{sub}</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={h.subsystems[sub]}
                  onChange={e => dispatch({
                    type: 'UPDATE_HOST',
                    payload: { id: h.id, subsystems: { ...h.subsystems, [sub]: parseInt(e.target.value) || 1 } },
                  })}
                  className="w-10 bg-[var(--color-input)] border border-[var(--color-border)] px-1 py-0.5 text-center text-xs font-mono focus:outline-none focus:border-[var(--color-primary)]"
                />
              </div>
            ))}
          </div>
        </Field>

        {/* Shutdown threshold */}
        <Field label="Shutdown Threshold (optional)">
          <Input
            type="number"
            min={1}
            value={h.shutdownThreshold ?? ''}
            onChange={e => dispatch({
              type: 'UPDATE_HOST',
              payload: { id: h.id, shutdownThreshold: parseInt(e.target.value) || undefined },
            })}
            placeholder="Auto (uses sheaf end)"
          />
        </Field>

        {/* PLTG Group ID */}
        <Field label="PLTG Group ID (optional)">
          <Input
            value={h.pltgGroupId ?? ''}
            onChange={e => dispatch({
              type: 'UPDATE_HOST',
              payload: { id: h.id, pltgGroupId: e.target.value || undefined },
            })}
            placeholder="e.g. corp-mainframe-ring"
          />
          <div className="text-[9px] opacity-40 mt-0.5">
            Hosts sharing the same PLTG Group ID carry security tally between them.
          </div>
        </Field>
      </div>
    </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]">{label}</label>
      {children}
    </div>
  );
}
