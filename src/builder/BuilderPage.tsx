import { useState } from 'react';
import { BuilderProvider, useBuilder } from '@/builder/builderContext';
import TopologyCanvas from '@/builder/topology/TopologyCanvas';
import HostEditor from '@/builder/editor/HostEditor';
import RTGSelector from '@/builder/RTGSelector';
import ExportDialog from '@/builder/ExportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveBuilderDraft, loadBuilderDraft, listBuilderDrafts, deleteBuilderDraft, createEmptyRunPacket } from '@/engine/runPacketCodec';
import { cn } from '@/lib/utils';

// ─── Left sidebar: run packet list ───────────────────────────────────────────

function DraftSidebar({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = useBuilder();
  const drafts = listBuilderDrafts();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function loadDraft(id: string) {
    const loaded = loadBuilderDraft(id);
    if (loaded) {
      dispatch({ type: 'SET_RUN_PACKET', payload: loaded });
      onClose();
    }
  }

  function deleteDraft(id: string) {
    deleteBuilderDraft(id);
    setConfirmDelete(null);
  }

  function newRun() {
    dispatch({ type: 'SET_RUN_PACKET', payload: createEmptyRunPacket() });
    onClose();
  }

  return (
    <div className="flex flex-col h-full font-mono text-[11px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]">Run Packets</span>
        <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]">✕</button>
      </div>

      <div className="p-2">
        <Button size="sm" className="w-full" onClick={newRun}>+ New Run</Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {drafts.length === 0 ? (
          <div className="px-3 py-4 text-[var(--color-muted-foreground)] text-center text-[10px]">
            No saved drafts
          </div>
        ) : (
          drafts.map(d => (
            <div
              key={d.id}
              className={cn(
                'flex items-center gap-1 px-2 py-1.5 border-b border-[var(--color-border)]/40 hover:bg-[var(--color-secondary)] cursor-pointer group',
                state.runPacket.id === d.id && 'bg-[var(--color-secondary)] text-[var(--color-primary)]',
              )}
              onClick={() => loadDraft(d.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{d.name || 'Unnamed Run'}</div>
              </div>
              {confirmDelete === d.id ? (
                <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => deleteDraft(d.id)}
                    className="text-[8px] border border-[var(--color-alert-active)] text-[var(--color-alert-active)] px-1"
                  >
                    Del
                  </button>
                  <button
                    onClick={() => setConfirmDelete(null)}
                    className="text-[8px] border border-[var(--color-border)] text-[var(--color-muted-foreground)] px-1"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(d.id); }}
                  className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-[var(--color-alert-active)] text-[10px] shrink-0"
                >
                  ✕
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Save current */}
      <div className="p-2 border-t border-[var(--color-border)]">
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={() => saveBuilderDraft(state.runPacket)}
        >
          Save Current Draft
        </Button>
      </div>
    </div>
  );
}

// ─── Top toolbar ─────────────────────────────────────────────────────────────

function BuilderToolbar({
  onToggleSidebar,
  sidebarOpen,
  onExport,
}: {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  onExport: () => void;
}) {
  const { state, dispatch } = useBuilder();
  const [editingName, setEditingName] = useState(false);

  return (
    <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border)] bg-[var(--color-card)]">
      {/* Hamburger / sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        className={cn(
          'text-[11px] border px-2 py-1 font-mono uppercase tracking-wider transition-colors',
          sidebarOpen
            ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
            : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:border-[var(--color-foreground)]',
        )}
        title="Run packet list"
      >
        ☰
      </button>

      {/* Run packet name */}
      {editingName ? (
        <Input
          autoFocus
          value={state.runPacket.name}
          onChange={e => dispatch({ type: 'SET_RUN_NAME', payload: e.target.value })}
          onBlur={() => setEditingName(false)}
          onKeyDown={e => e.key === 'Enter' && setEditingName(false)}
          className="w-52 text-sm font-bold"
        />
      ) : (
        <button
          className="text-sm font-bold font-mono text-[var(--color-primary)] matrix-glow hover:opacity-80 truncate max-w-[200px]"
          onClick={() => setEditingName(true)}
          title="Click to rename"
        >
          {state.runPacket.name || 'Unnamed Run'}
        </button>
      )}

      {state.isDirty && (
        <span className="text-[9px] text-[var(--color-alert-passive)] uppercase tracking-wider">● unsaved</span>
      )}

      <div className="flex-1" />

      {/* RTG selector */}
      <RTGSelector />

      {/* Save draft */}
      <Button
        size="sm"
        variant="outline"
        onClick={() => saveBuilderDraft(state.runPacket)}
      >
        Save Draft
      </Button>

      {/* Export */}
      <Button size="sm" onClick={onExport}>
        Export .mxrun
      </Button>
    </div>
  );
}

// ─── Inner layout (needs BuilderProvider context) ─────────────────────────────

function BuilderLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [topHeight, setTopHeight] = useState(55); // percent

  function onDividerDrag(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const container = (e.currentTarget.parentElement as HTMLElement);
    const startY = e.clientY;
    const startH = topHeight;

    function onMove(ev: MouseEvent) {
      const totalH = container.getBoundingClientRect().height;
      const delta = ((ev.clientY - startY) / totalH) * 100;
      setTopHeight(Math.min(80, Math.max(20, startH + delta)));
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-background)]">
      {/* Top toolbar */}
      <BuilderToolbar
        onToggleSidebar={() => setSidebarOpen(v => !v)}
        sidebarOpen={sidebarOpen}
        onExport={() => setExportOpen(true)}
      />

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        {sidebarOpen && (
          <div className="w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-card)] overflow-hidden">
            <DraftSidebar onClose={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* Split pane: topology top, editor bottom */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Topology canvas */}
          <div style={{ height: `${topHeight}%`, minHeight: 120 }} className="overflow-hidden">
            <TopologyCanvas />
          </div>

          {/* Resize handle */}
          <div
            className="h-1.5 bg-[var(--color-border)] hover:bg-[var(--color-primary)] cursor-row-resize shrink-0 transition-colors"
            onMouseDown={onDividerDrag}
          />

          {/* Host editor */}
          <div className="flex-1 overflow-hidden bg-[var(--color-card)] border-t border-[var(--color-border)]">
            <HostEditor />
          </div>
        </div>
      </div>

      {exportOpen && <ExportDialog onClose={() => setExportOpen(false)} />}
    </div>
  );
}

// ─── Public export (wraps with provider) ─────────────────────────────────────

export default function BuilderPage() {
  return (
    <BuilderProvider>
      <BuilderLayout />
    </BuilderProvider>
  );
}
