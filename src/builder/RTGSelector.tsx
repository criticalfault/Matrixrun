import { useState } from 'react';
import { getRTGsByRegion, RTG_REGIONS } from '@/data/rtgData';
import type { RTGEntry } from '@/types';
import { useBuilder } from '@/builder/builderContext';
import { SECURITY_CODE_COLORS } from '@/data/srTables';
import { cn } from '@/lib/utils';

export default function RTGSelector() {
  const { state, dispatch } = useBuilder();
  const current = state.runPacket.rtg;
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState<string>(RTG_REGIONS[0]);
  const [search, setSearch] = useState('');

  const byRegion = getRTGsByRegion();

  const filtered = (byRegion[region as keyof typeof byRegion] ?? []).filter(r =>
    !search || r.name.toLowerCase().includes(search.toLowerCase()) || r.code.toLowerCase().includes(search.toLowerCase()),
  );

  function select(rtg: RTGEntry | null) {
    dispatch({ type: 'SET_RTG', payload: rtg });
    setOpen(false);
    setSearch('');
  }

  const btnColor = current ? SECURITY_CODE_COLORS[current.securityCode] : 'var(--color-muted-foreground)';

  return (
    <div className="relative">
      {/* Trigger */}
      <button
        onClick={() => setOpen(v => !v)}
        className={cn(
          'flex items-center gap-2 border px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors',
          open
            ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
            : 'border-[var(--color-border)] text-[var(--color-foreground)] hover:border-[var(--color-muted-foreground)]',
        )}
      >
        <span>◎</span>
        <span style={{ color: btnColor }}>
          {current ? `RTG: ${current.name} (${current.securityCode}-${current.securityValue})` : 'No RTG (Air-gapped)'}
        </span>
        <span className="opacity-40">▾</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-[var(--color-card)] border border-[var(--color-border)] font-mono text-[11px]"
          style={{ width: 440, maxHeight: 380 }}
        >
          {/* Search */}
          <div className="p-2 border-b border-[var(--color-border)]">
            <input
              className="w-full bg-[var(--color-background)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)]"
              placeholder="Search RTG name or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          {/* Region tabs */}
          <div className="flex border-b border-[var(--color-border)]">
            {RTG_REGIONS.map(r => (
              <button
                key={r}
                onClick={() => { setRegion(r); setSearch(''); }}
                className={cn(
                  'flex-1 py-1 text-[9px] uppercase tracking-wider transition-colors',
                  region === r
                    ? 'text-[var(--color-primary)] border-b border-[var(--color-primary)] -mb-px'
                    : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                )}
              >
                {r.split('/')[0]}
              </button>
            ))}
          </div>

          {/* No RTG option */}
          <button
            onClick={() => select(null)}
            className={cn(
              'w-full text-left px-3 py-1.5 flex items-center gap-2 hover:bg-[var(--color-secondary)] transition-colors',
              !current && 'text-[var(--color-primary)]',
            )}
          >
            <span className="opacity-40">✕</span>
            <span className="text-[var(--color-muted-foreground)]">No RTG (Air-gapped / direct connect)</span>
          </button>

          {/* RTG list */}
          <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
            {filtered.map(rtg => {
              const color = SECURITY_CODE_COLORS[rtg.securityCode];
              const isSelected = current?.id === rtg.id;
              return (
                <button
                  key={rtg.id}
                  onClick={() => select(rtg)}
                  className={cn(
                    'w-full text-left px-3 py-1.5 flex items-center gap-3 hover:bg-[var(--color-secondary)] transition-colors',
                    isSelected && 'bg-[var(--color-secondary)]',
                  )}
                >
                  {/* Sec code badge */}
                  <span
                    className="text-[9px] border px-1 shrink-0"
                    style={{ color, borderColor: `${color}66` }}
                  >
                    {rtg.securityCode[0]}-{rtg.securityValue}
                  </span>
                  {/* Name + code */}
                  <span className="flex-1 truncate text-[var(--color-foreground)]">{rtg.name}</span>
                  <span className="text-[9px] opacity-40 shrink-0">{rtg.code}</span>
                  {/* Quick stats */}
                  <span className="text-[9px] opacity-40 shrink-0">
                    A{rtg.subsystems.access}/C{rtg.subsystems.control}/I{rtg.subsystems.index}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-[var(--color-muted-foreground)] text-center">
                No results
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
