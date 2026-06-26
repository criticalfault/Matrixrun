import { useState } from 'react';
import { useBuilder } from '@/builder/builderContext';
import type { HostFile, FileDefense } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { randomizePaydata } from '@/engine/randomizeHost';

function newFile(): HostFile {
  return {
    id: crypto.randomUUID(),
    name: 'New File',
    description: '',
    sizeMp: 10,
    defense: 'none',
    isPaydata: false,
  };
}

const DEFENSES: { value: FileDefense; label: string; color: string }[] = [
  { value: 'none', label: 'None', color: 'var(--color-muted-foreground)' },
  { value: 'encrypted', label: 'Encrypted', color: 'var(--color-accent)' },
  { value: 'dataBomb', label: 'Data Bomb', color: 'var(--color-alert-active)' },
  { value: 'worms', label: 'Worms', color: 'var(--color-alert-passive)' },
  { value: 'encryptedAndBomb', label: 'Enc + Bomb', color: 'var(--color-sec-red)' },
];

function FileRow({ file, hostId }: { file: HostFile; hostId: string }) {
  const { dispatch } = useBuilder();
  const [expanded, setExpanded] = useState(false);

  const defColor = DEFENSES.find(d => d.value === file.defense)?.color ?? 'var(--color-muted-foreground)';

  function update(patch: Partial<HostFile>) {
    dispatch({ type: 'UPDATE_FILE', payload: { hostId, file: { ...file, ...patch } } });
  }

  return (
    <div className="border border-[var(--color-border)] mb-2 font-mono text-[11px]">
      {/* Row summary */}
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--color-secondary)]"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-[10px] opacity-30">{expanded ? '▾' : '▸'}</span>
        <span className="flex-1 truncate text-[var(--color-foreground)]">{file.name}</span>
        <span className="text-[9px]" style={{ color: defColor }}>{DEFENSES.find(d => d.value === file.defense)?.label}</span>
        <span className="text-[9px] opacity-40">{file.sizeMp} Mp</span>
        {file.isPaydata && <span className="text-[9px] text-[var(--color-primary)]">¥</span>}
        <button
          onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_FILE', payload: { hostId, fileId: file.id } }); }}
          className="text-[var(--color-alert-active)] opacity-40 hover:opacity-100 text-[10px]"
        >
          ✕
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-[var(--color-border)] p-2 grid grid-cols-2 gap-x-3 gap-y-2 bg-[var(--color-background)]">
          <div className="col-span-2">
            <label className="text-[9px] uppercase tracking-wider opacity-50">File Name</label>
            <Input value={file.name} onChange={e => update({ name: e.target.value })} className="mt-0.5" />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] uppercase tracking-wider opacity-50">Contents (shown to decker)</label>
            <textarea
              value={file.description}
              onChange={e => update({ description: e.target.value })}
              rows={2}
              className="mt-0.5 w-full bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
              placeholder="What the decker reads when they open this file..."
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider opacity-50">Size (Mp)</label>
            <Input
              type="number" min={1}
              value={file.sizeMp}
              onChange={e => update({ sizeMp: parseInt(e.target.value) || 1 })}
              className="mt-0.5"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider opacity-50">Defense</label>
            <select
              value={file.defense}
              onChange={e => update({ defense: e.target.value as FileDefense })}
              className="mt-0.5 w-full bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-[var(--color-primary)]"
              style={{ color: defColor }}
            >
              {DEFENSES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          {(file.defense === 'dataBomb' || file.defense === 'encryptedAndBomb') && (
            <div>
              <label className="text-[9px] uppercase tracking-wider opacity-50">Bomb Rating</label>
              <Input
                type="number" min={1}
                value={file.bombRating ?? ''}
                onChange={e => update({ bombRating: parseInt(e.target.value) || undefined })}
                placeholder="e.g. 6"
                className="mt-0.5"
              />
            </div>
          )}
          {file.defense === 'worms' && (
            <div>
              <label className="text-[9px] uppercase tracking-wider opacity-50">Worm Rating</label>
              <Input
                type="number" min={1}
                value={file.wormRating ?? ''}
                onChange={e => update({ wormRating: parseInt(e.target.value) || undefined })}
                placeholder="e.g. 4"
                className="mt-0.5"
              />
            </div>
          )}
          <div className={cn('flex items-center gap-2', (file.defense === 'dataBomb' || file.defense === 'encryptedAndBomb') ? '' : 'col-span-2')}>
            <input
              type="checkbox"
              id={`paydata-${file.id}`}
              checked={file.isPaydata}
              onChange={e => update({ isPaydata: e.target.checked })}
              className="accent-[var(--color-primary)]"
            />
            <label htmlFor={`paydata-${file.id}`} className="text-[10px] opacity-70 cursor-pointer">
              Is Paydata (valuable to sell)
            </label>
          </div>
          {file.isPaydata && (
            <div>
              <label className="text-[9px] uppercase tracking-wider opacity-50">Value (¥, blank = rolled)</label>
              <Input
                type="number" min={1}
                value={file.paydataValue ?? ''}
                onChange={e => update({ paydataValue: parseInt(e.target.value) || undefined })}
                placeholder="5000"
                className="mt-0.5"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function FilesTab() {
  const { selectedHost, dispatch } = useBuilder();
  if (!selectedHost) return null;
  const h = selectedHost;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]">
          Files — {h.files.length} defined
          {h.files.filter(f => f.isPaydata).length > 0 && (
            <span className="ml-2 text-[var(--color-primary)]">
              ({h.files.filter(f => f.isPaydata).length} paydata)
            </span>
          )}
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          title={`Roll one random paydata file for a ${h.securityCode} host`}
          onClick={() => {
            const [file] = randomizePaydata(h.securityCode);
            if (file) dispatch({ type: 'ADD_FILE', payload: { hostId: h.id, file } });
          }}
        >
          + Paydata
        </Button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'ADD_FILE', payload: { hostId: h.id, file: newFile() } })}>
          + File
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {h.files.length === 0 ? (
          <EmptyState text="No files defined. Add files the decker can Locate and Download." />
        ) : (
          h.files.map(f => <FileRow key={f.id} file={f} hostId={h.id} />)
        )}
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-[10px] text-[var(--color-muted-foreground)] text-center py-8 font-mono">{text}</div>;
}
