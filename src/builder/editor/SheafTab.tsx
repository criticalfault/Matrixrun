import { useState } from 'react';
import { useBuilder } from '@/builder/builderContext';
import { IC_DEFINITIONS, IC_CATEGORY_COLOR, WORM_DEFINITIONS } from '@/data/srTables';
import { randomizeSheaf } from '@/engine/randomizeHost';
import type { ICType, ICCategory, ICOption, PersonaAttribute, TriggerStep, ICInstance, WormSubtype } from '@/types';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const IC_BY_CATEGORY: Record<ICCategory, ICType[]> = {
  ReactiveWhite:  ['Probe', 'Trace', 'TarBaby'],
  ProactiveWhite: ['Killer', 'Crippler', 'Scout'],
  ReactiveGray:   ['TarPit', 'TraceWithTrap', 'ProbeWithTrap', 'ScoutWithTrap'],
  ProactiveGray:  ['Ripper', 'Blaster', 'Sparky', 'Construct'],
  Black:          ['Psychotropic', 'Lethal', 'NonLethal', 'Cerebropathic'],
};

const IC_OPTIONS: ICOption[] = ['Shield', 'Armor', 'Trap', 'Shift', 'Cascading', 'Expert', 'Party'];
const PERSONA_ATTRS: PersonaAttribute[] = ['Bod', 'Evasion', 'Masking', 'Sensors'];

function newStep(triggerValue: number): TriggerStep {
  return { id: crypto.randomUUID(), triggerValue, ic: [] };
}

function newIC(type: ICType, secValue: number): ICInstance {
  const def = IC_DEFINITIONS[type];
  return {
    id: crypto.randomUUID(),
    type,
    category: def.category,
    rating: secValue,
    options: [],
    isConstruct: def.isConstruct ?? false,
    status: 'dormant',
    currentRating: secValue,
  };
}

const DAMAGE_CODE_COLOR: Record<string, string> = {
  M: '#eab308',
  S: '#f97316',
  D: '#ef4444',
};

const WORM_SUBTYPES: WormSubtype[] = ['Crashworm','Deathworm','Dataworm','Tapeworm','Ringworm'];

// ─── IC Row ───────────────────────────────────────────────────────────────────

function ICRow({
  ic, hostId, step,
}: {
  ic: ICInstance; hostId: string; step: TriggerStep;
}) {
  const { dispatch } = useBuilder();
  const def = IC_DEFINITIONS[ic.type];
  const catColor = IC_CATEGORY_COLOR[ic.category];

  function updateIC(patch: Partial<ICInstance>) {
    const updatedStep: TriggerStep = {
      ...step,
      ic: step.ic.map(i => i.id === ic.id ? { ...i, ...patch } : i),
    };
    dispatch({ type: 'UPDATE_TRIGGER_STEP', payload: { hostId, step: updatedStep } });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 py-1 border-b border-[var(--color-border)]/40 last:border-0 text-[11px] font-mono group">
      {/* Category dot */}
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />

      {/* Type + damage badge */}
      <span className="truncate" style={{ color: catColor, minWidth: '6rem' }}>
        {def.label}
        {ic.damageCode && (
          <span
            className="ml-1 px-1 py-0 text-[8px] border rounded-sm font-bold uppercase"
            style={{
              borderColor: DAMAGE_CODE_COLOR[ic.damageCode] ?? 'var(--color-border)',
              color: DAMAGE_CODE_COLOR[ic.damageCode] ?? 'var(--color-foreground)',
              backgroundColor: `${DAMAGE_CODE_COLOR[ic.damageCode] ?? '#888'}22`,
            }}
          >
            {ic.damageCode}
          </span>
        )}
      </span>

      {/* Rating */}
      <div className="flex items-center gap-1">
        <span className="text-[9px] opacity-40">RTG</span>
        <input
          type="number"
          min={1}
          max={20}
          value={ic.rating}
          onChange={e => updateIC({ rating: parseInt(e.target.value) || 1, currentRating: parseInt(e.target.value) || 1 })}
          className="w-10 bg-[var(--color-input)] border border-[var(--color-border)] px-1 text-center text-[11px] font-mono focus:outline-none focus:border-[var(--color-primary)]"
        />
      </div>

      {/* Target attribute (Crippler/Ripper) */}
      {(ic.type === 'Crippler' || ic.type === 'Ripper') && (
        <select
          value={ic.targetAttribute ?? 'Bod'}
          onChange={e => updateIC({ targetAttribute: e.target.value as typeof ic.targetAttribute })}
          className="bg-[var(--color-input)] border border-[var(--color-border)] text-[10px] font-mono px-1 py-0.5 focus:outline-none focus:border-[var(--color-primary)]"
        >
          {PERSONA_ATTRS.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      )}

      {/* Worm subtype */}
      {ic.type === 'Worm' && (
        <div className="flex items-center gap-1">
          <select
            value={ic.wormSubtype ?? ''}
            onChange={e => updateIC({ wormSubtype: (e.target.value as WormSubtype) || undefined })}
            className="bg-[var(--color-input)] border border-[var(--color-border)] text-[10px] font-mono px-1 py-0.5 focus:outline-none focus:border-[var(--color-primary)]"
          >
            <option value="">— subtype —</option>
            {WORM_SUBTYPES.map(w => (
              <option key={w} value={w} title={WORM_DEFINITIONS[w].effect}>{w}</option>
            ))}
          </select>
          {ic.wormSubtype && (
            <span className="text-[9px] text-[var(--color-muted-foreground)] italic">
              ({ic.wormSubtype})
            </span>
          )}
        </div>
      )}

      {/* Options */}
      <div className="flex gap-1 flex-wrap flex-1">
        {IC_OPTIONS.map(opt => (
          <button
            key={opt}
            className={cn(
              'text-[8px] border px-1 py-0 transition-colors uppercase',
              ic.options.includes(opt)
                ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-foreground)]',
            )}
            onClick={() => {
              const newOptions = ic.options.includes(opt)
                ? ic.options.filter(o => o !== opt)
                : [...ic.options, opt];
              updateIC({ options: newOptions });
            }}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Delete */}
      <button
        onClick={() => dispatch({ type: 'DELETE_IC', payload: { hostId, stepId: step.id, icId: ic.id } })}
        className="opacity-0 group-hover:opacity-100 text-[var(--color-alert-active)] text-[10px] shrink-0 transition-opacity"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Trigger Step Row ─────────────────────────────────────────────────────────

function TriggerStepRow({ step, hostId, secValue }: {
  step: TriggerStep; hostId: string; secValue: number;
}) {
  const { dispatch } = useBuilder();
  const [addingIC, setAddingIC] = useState(false);
  const [selectedType, setSelectedType] = useState<ICType>('Probe');

  const alertColor =
    step.alertChange === 'shutdown' ? 'var(--color-alert-shutdown)' :
    step.alertChange === 'active'   ? 'var(--color-alert-active)' :
    step.alertChange === 'passive'  ? 'var(--color-alert-passive)' :
    'transparent';

  return (
    <div className="border border-[var(--color-border)] bg-[var(--color-card)] mb-2">
      {/* Step header */}
      <div className="flex items-center gap-2 px-2 py-1 border-b border-[var(--color-border)] bg-[var(--color-secondary)]">
        <span className="text-[9px] opacity-40 uppercase tracking-wider">Tally ≥</span>
        <input
          type="number"
          min={1}
          value={step.triggerValue}
          onChange={e => dispatch({
            type: 'UPDATE_TRIGGER_STEP',
            payload: { hostId, step: { ...step, triggerValue: parseInt(e.target.value) || 1 } },
          })}
          className="w-12 bg-[var(--color-input)] border border-[var(--color-border)] px-1 py-0 text-center text-xs font-mono font-bold text-[var(--color-primary)] focus:outline-none"
        />

        {/* Alert change */}
        <span className="text-[9px] opacity-40 uppercase tracking-wider ml-2">Alert</span>
        <select
          value={step.alertChange ?? ''}
          onChange={e => dispatch({
            type: 'UPDATE_TRIGGER_STEP',
            payload: { hostId, step: { ...step, alertChange: (e.target.value as typeof step.alertChange) || undefined } },
          })}
          className="border text-[10px] font-mono px-1 py-0 focus:outline-none"
          style={{
            backgroundColor: '#0d1117',
            borderColor: 'var(--color-border)',
            color: alertColor || '#6b7280',
          }}
        >
          <option value=""        style={{ background: '#0d1117', color: '#6b7280' }}>None</option>
          <option value="passive" style={{ background: '#111', color: 'var(--color-alert-passive)' }}>Passive Alert</option>
          <option value="active"  style={{ background: '#111', color: 'var(--color-alert-active)' }}>Active Alert</option>
          <option value="shutdown"style={{ background: '#111', color: 'var(--color-alert-shutdown)' }}>Shutdown</option>
        </select>

        <div className="flex-1" />

        {/* Add IC button */}
        <button
          onClick={() => setAddingIC(v => !v)}
          className="text-[9px] border border-[var(--color-primary)] text-[var(--color-primary)] px-2 py-0 hover:bg-[var(--color-primary)]/10 uppercase tracking-wider"
        >
          + IC
        </button>
        <button
          onClick={() => dispatch({ type: 'DELETE_TRIGGER_STEP', payload: { hostId, stepId: step.id } })}
          className="text-[9px] text-[var(--color-alert-active)] px-1 hover:opacity-80"
        >
          ✕
        </button>
      </div>

      {/* Add IC form */}
      {addingIC && (
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-background)]">
          <select
            value={selectedType}
            onChange={e => setSelectedType(e.target.value as ICType)}
            className="flex-1 border text-[10px] font-mono px-1 py-0.5 focus:outline-none focus:border-[var(--color-primary)]"
            style={{ backgroundColor: '#0d1117', borderColor: 'var(--color-border)', color: '#e2e8f0' }}
          >
            {(Object.entries(IC_BY_CATEGORY) as [ICCategory, ICType[]][]).map(([cat, types]) => (
              <optgroup key={cat} label={cat.replace(/([A-Z])/g, ' $1').trim()} style={{ background: '#0d1117', color: '#6b7280' }}>
                {types.map(t => (
                  <option key={t} value={t} style={{ background: '#0d1117', color: '#e2e8f0' }}>{IC_DEFINITIONS[t].label}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <Button
            size="sm"
            onClick={() => {
              dispatch({ type: 'ADD_IC', payload: { hostId, stepId: step.id, ic: newIC(selectedType, secValue) } });
              setAddingIC(false);
            }}
          >
            Add
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAddingIC(false)}>Cancel</Button>
        </div>
      )}

      {/* IC list */}
      <div className="px-2 py-1">
        {step.ic.length === 0 ? (
          <div className="text-[9px] text-[var(--color-muted-foreground)] py-1">No IC at this step</div>
        ) : (
          step.ic.map(ic => (
            <ICRow key={ic.id} ic={ic} hostId={hostId} step={step} />
          ))
        )}
      </div>

      {/* Alert / Shutdown banner — always visible when set */}
      {step.alertChange && (
        <div
          className="flex items-center gap-2 px-2 py-1 border-t font-mono text-[10px] uppercase tracking-wider"
          style={{
            borderColor: `${alertColor}44`,
            backgroundColor: `${alertColor}12`,
            color: alertColor,
          }}
        >
          <span>
            {step.alertChange === 'passive'  && '⚠ Passive Alert triggered'}
            {step.alertChange === 'active'   && '🚨 Active Alert triggered — security deckers respond'}
            {step.alertChange === 'shutdown' && '☠ Host Shutdown initiated'}
          </span>
          <button
            className="ml-auto text-[9px] opacity-40 hover:opacity-80"
            title="Remove alert"
            onClick={() => dispatch({
              type: 'UPDATE_TRIGGER_STEP',
              payload: { hostId, step: { ...step, alertChange: undefined } },
            })}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Sheaf Tab ───────────────────────────────────────────────────────────

export default function SheafTab() {
  const { selectedHost, dispatch } = useBuilder();
  const [justRerolled, setJustRerolled] = useState(false);
  if (!selectedHost) return null;

  const h = selectedHost;
  const nextTrigger = h.securitySheaf.length > 0
    ? Math.max(...h.securitySheaf.map(s => s.triggerValue)) + 4
    : 3;

  function handleRerollIC() {
    dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, securitySheaf: randomizeSheaf(h) } });
    setJustRerolled(true);
    setTimeout(() => setJustRerolled(false), 1200);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]">
          Security Sheaf — {h.securitySheaf.length} trigger steps
        </span>
        <div className="flex-1" />
        {h.securitySheaf.length > 0 && (
          <button
            onClick={handleRerollIC}
            className="text-[10px] border px-2 py-0.5 font-mono uppercase tracking-wider transition-all"
            style={{
              borderColor: justRerolled ? 'var(--color-primary)' : 'var(--color-border)',
              color: justRerolled ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
              backgroundColor: justRerolled ? 'var(--color-primary)15' : 'transparent',
            }}
            title="Keep step triggers, reroll all IC assignments"
          >
            {justRerolled ? '✓ Rerolled' : '⚄ Reroll IC'}
          </button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => dispatch({
            type: 'ADD_TRIGGER_STEP',
            payload: { hostId: h.id, step: newStep(nextTrigger) },
          })}
        >
          + Step
        </Button>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-3">
        {h.securitySheaf.length === 0 ? (
          <div className="text-[10px] text-[var(--color-muted-foreground)] text-center py-8">
            No trigger steps yet.
            <br />
            Add steps to define when IC activates.
          </div>
        ) : (
          h.securitySheaf.map(step => (
            <TriggerStepRow
              key={step.id}
              step={step}
              hostId={h.id}
              secValue={h.securityValue}
            />
          ))
        )}
      </div>
    </div>
  );
}
