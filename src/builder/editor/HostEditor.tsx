import { useState } from 'react';
import { useBuilder } from '@/builder/builderContext';
import { SECURITY_CODE_COLORS } from '@/data/srTables';
import { cn } from '@/lib/utils';
import OverviewTab from './OverviewTab';
import SheafTab from './SheafTab';
import FilesTab from './FilesTab';
import SlavesTab from './SlavesTab';
import SANEditor from './SANEditor';

type Tab = 'overview' | 'sheaf' | 'files' | 'slaves';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'sheaf',    label: 'Security Sheaf' },
  { id: 'files',    label: 'Files' },
  { id: 'slaves',   label: 'Slaves' },
];

export default function HostEditor() {
  const { selectedHost } = useBuilder();
  const [tab, setTab] = useState<Tab>('overview');

  if (!selectedHost) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--color-muted-foreground)] font-mono text-xs">
        Select a host node to edit it
      </div>
    );
  }

  // SANs/LTGs get a lightweight panel instead of the full tabbed editor
  if (['san','one-way-san','vanishing-san','ltg','pltg'].includes(selectedHost.nodeType ?? '')) {
    return <SANEditor />;
  }

  const h = selectedHost;
  const secColor = SECURITY_CODE_COLORS[h.securityCode];

  return (
    <div className="flex flex-col h-full">
      {/* Title bar */}
      <div
        className="flex items-center gap-3 px-3 py-1.5 border-b font-mono text-[11px]"
        style={{ borderColor: `${secColor}44`, backgroundColor: `${secColor}08` }}
      >
        <span className="font-bold" style={{ color: secColor }}>{h.securityCode}-{h.securityValue}</span>
        <span className="text-[var(--color-foreground)] flex-1 truncate">{h.name}</span>
        <span className="opacity-40 text-[9px]">
          {h.securitySheaf.length} steps · {h.files.length} files · {h.slaves.length} slaves
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-[var(--color-border)]">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'px-4 py-1.5 text-[10px] uppercase tracking-wider font-mono transition-colors',
              tab === t.id
                ? 'text-[var(--color-primary)] border-b border-[var(--color-primary)] -mb-px bg-[var(--color-primary)]/5'
                : 'text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {t.label}
            {t.id === 'sheaf' && h.securitySheaf.length > 0 && (
              <span className="ml-1 opacity-60">({h.securitySheaf.length})</span>
            )}
            {t.id === 'files' && h.files.length > 0 && (
              <span className="ml-1 opacity-60">({h.files.length})</span>
            )}
            {t.id === 'slaves' && h.slaves.length > 0 && (
              <span className="ml-1 opacity-60">({h.slaves.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {tab === 'overview' && <OverviewTab />}
        {tab === 'sheaf'    && <SheafTab />}
        {tab === 'files'    && <FilesTab />}
        {tab === 'slaves'   && <SlavesTab />}
      </div>
    </div>
  );
}
