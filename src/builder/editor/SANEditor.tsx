import { useBuilder } from '@/builder/builderContext';
import { Input } from '@/components/ui/input';
import type { TopologyNodeType, VanishingSANVariant } from '@/types';

const SAN_TYPES: Array<{ id: TopologyNodeType; label: string; color: string }> = [
  { id: 'san',          label: 'SAN',          color: '#38bdf8' },
  { id: 'one-way-san',  label: 'One-Way SAN',  color: '#38bdf8' },
  { id: 'vanishing-san',label: 'Vanishing SAN', color: '#f59e0b' },
  { id: 'ltg',          label: 'LTG',          color: '#14b8a6' },
  { id: 'pltg',         label: 'PLTG',         color: '#6366f1' },
];

const VANISHING_VARIANTS: Array<{ id: VanishingSANVariant; label: string; description: string }> = [
  {
    id: 'timed',
    label: 'Timed',
    description: 'The SAN disappears after a fixed number of turns. Plan your exit.',
  },
  {
    id: 'teleporting',
    label: 'Teleporting',
    description: 'The SAN randomly relocates after each use. Finding it again requires re-scouting.',
  },
  {
    id: 'triggered',
    label: 'Triggered',
    description: 'The SAN vanishes when a specific in-host condition is met (GM-defined trigger).',
  },
];

export default function SANEditor() {
  const { selectedHost, state, dispatch } = useBuilder();
  if (!selectedHost) return null;

  const h = selectedHost;
  const nodeType = h.nodeType ?? 'san';
  const typeDef = SAN_TYPES.find(t => t.id === nodeType) ?? SAN_TYPES[0];
  const accentColor = typeDef.color;

  const isLTGlike = nodeType === 'ltg' || nodeType === 'pltg';
  const isOneWay  = nodeType === 'one-way-san';
  const isVanishing = nodeType === 'vanishing-san';

  // Nodes this SAN connects to
  const outboundHosts = h.nextHostIds
    .map(id => state.runPacket.hosts.find(n => n.id === id))
    .filter(Boolean);

  const typeIcon =
    nodeType === 'ltg'          ? '⬡' :
    nodeType === 'pltg'         ? '🔒' :
    nodeType === 'vanishing-san'? '⏱' :
    nodeType === 'one-way-san'  ? '→' :
    '◇';

  return (
    <div className="flex flex-col h-full font-mono text-[11px]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-b"
        style={{ borderColor: `${accentColor}44`, backgroundColor: `${accentColor}0d` }}
      >
        <span className="font-bold" style={{ color: accentColor }}>
          {typeIcon} {typeDef.label}
        </span>
        <span className="opacity-40 text-[9px]">
          {isLTGlike ? 'Telecommunications Grid Node' : 'System Access Node'}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Name */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Label
          </label>
          <Input
            value={h.name}
            onChange={e => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, name: e.target.value } })}
            className="font-mono text-xs"
          />
        </div>

        {/* Type toggle */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Type
          </label>
          <div className="flex gap-1 flex-wrap">
            {SAN_TYPES.map(t => (
              <button
                key={t.id}
                onClick={() => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, nodeType: t.id } })}
                className="px-2 py-1 text-[9px] border font-mono uppercase tracking-wider transition-colors"
                style={{
                  borderColor: nodeType === t.id ? t.color : 'var(--color-border)',
                  color: nodeType === t.id ? t.color : 'var(--color-muted-foreground)',
                  backgroundColor: nodeType === t.id ? `${t.color}11` : 'transparent',
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* One-way SAN options */}
        {isOneWay && (
          <div className="space-y-2 border border-[#38bdf822] bg-[#38bdf808] p-3">
            <p className="text-[9px] text-[var(--color-muted-foreground)] leading-relaxed">
              Bars inbound traffic. Decker enters with +1D6 to Access Rating.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                Access Bonus (1–6, added to Access Rating)
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={h.oneWaySANAccessBonus ?? 3}
                onChange={e => dispatch({
                  type: 'UPDATE_HOST',
                  payload: { id: h.id, oneWaySANAccessBonus: Math.min(6, Math.max(1, parseInt(e.target.value) || 1)) },
                })}
                className="w-16 bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-center text-xs font-mono focus:outline-none focus:border-[#38bdf8]"
              />
            </div>
          </div>
        )}

        {/* Vanishing SAN options */}
        {isVanishing && (
          <div className="space-y-2 border border-[#f59e0b22] bg-[#f59e0b08] p-3">
            <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
              Variant
            </label>
            <div className="flex gap-1 flex-wrap">
              {VANISHING_VARIANTS.map(v => (
                <button
                  key={v.id}
                  onClick={() => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, vanishingSANVariant: v.id } })}
                  className="px-2 py-1 text-[9px] border font-mono uppercase tracking-wider transition-colors"
                  style={{
                    borderColor: h.vanishingSANVariant === v.id ? '#f59e0b' : 'var(--color-border)',
                    color: h.vanishingSANVariant === v.id ? '#f59e0b' : 'var(--color-muted-foreground)',
                    backgroundColor: h.vanishingSANVariant === v.id ? '#f59e0b11' : 'transparent',
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
            {h.vanishingSANVariant && (
              <p className="text-[9px] text-[var(--color-muted-foreground)] leading-relaxed">
                {VANISHING_VARIANTS.find(v => v.id === h.vanishingSANVariant)?.description}
              </p>
            )}
          </div>
        )}

        {/* LTG / PLTG options */}
        {isLTGlike && (
          <div className="space-y-2 border border-[#6366f122] bg-[#6366f108] p-3">
            <p className="text-[9px] text-[var(--color-muted-foreground)] leading-relaxed">
              Hosts sharing the same PLTG Group ID carry security tally between them.
            </p>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
                PLTG Group ID
              </label>
              <Input
                value={h.pltgGroupId ?? ''}
                onChange={e => dispatch({
                  type: 'UPDATE_HOST',
                  payload: { id: h.id, pltgGroupId: e.target.value || undefined },
                })}
                placeholder="e.g. corp-mainframe-ring"
                className="font-mono text-xs"
              />
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            GM Notes
          </label>
          <textarea
            value={h.description}
            onChange={e => dispatch({ type: 'UPDATE_HOST', payload: { id: h.id, description: e.target.value } })}
            className="w-full bg-[var(--color-background)] border border-[var(--color-border)] rounded px-2 py-1.5 text-[11px] font-mono text-[var(--color-foreground)] resize-none h-20 focus:outline-none focus:border-[var(--color-primary)]"
            placeholder="Optional notes about this access node..."
          />
        </div>

        {/* Outbound connections */}
        <div className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[var(--color-muted-foreground)]">
            Connects To
          </label>
          {outboundHosts.length === 0 ? (
            <p className="text-[10px] text-[var(--color-muted-foreground)] italic">
              No outbound connections — use "+ Connect →" in the topology toolbar.
            </p>
          ) : (
            <div className="space-y-1">
              {outboundHosts.map(target => target && (
                <div
                  key={target.id}
                  className="flex items-center justify-between px-2 py-1 border border-[var(--color-border)] bg-[var(--color-background)]"
                >
                  <span className="text-[var(--color-foreground)]">
                    {['san','one-way-san','vanishing-san','ltg','pltg'].includes(target.nodeType ?? '')
                      ? `◇ ${target.name}`
                      : `▣ ${target.name}`}
                  </span>
                  <button
                    onClick={() => dispatch({
                      type: 'REMOVE_CONNECTION',
                      payload: { fromId: h.id, toId: target.id },
                    })}
                    className="text-[var(--color-alert-active)] text-[10px] opacity-60 hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
