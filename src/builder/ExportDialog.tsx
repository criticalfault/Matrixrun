import { useState } from 'react';
import { useBuilder } from '@/builder/builderContext';
import { downloadRunPacket } from '@/engine/runPacketCodec';
import { Button } from '@/components/ui/button';

interface Props {
  onClose: () => void;
}

export default function ExportDialog({ onClose }: Props) {
  const { state } = useBuilder();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleExport() {
    setError('');
    setExporting(true);
    try {
      await downloadRunPacket(state.runPacket);
      setDone(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setExporting(false);
    }
  }

  const packetName = state.runPacket.name || 'Unnamed Run';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] w-[380px] font-mono">
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)] bg-[var(--color-secondary)]">
          <span className="text-[11px] uppercase tracking-widest text-[var(--color-primary)]">Export Run Packet</span>
          <button onClick={onClose} className="text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] text-xs">✕</button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          {done ? (
            <div className="text-center py-4">
              <div className="text-[var(--color-primary)] text-2xl mb-2">✓</div>
              <div className="text-sm text-[var(--color-foreground)]">
                <span className="text-[var(--color-primary)]">{packetName}.mxrun</span> downloaded.
              </div>
              <Button className="mt-4" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <>
              <div className="text-[10px] text-[var(--color-muted-foreground)] leading-relaxed">
                Exports <span className="text-[var(--color-foreground)]">{packetName}</span> as an encrypted <span className="text-[var(--color-primary)]">.mxrun</span> file.
                GM notes are stripped before export.
              </div>

              {error && (
                <div className="text-[var(--color-alert-active)] text-[10px] border border-[var(--color-alert-active)]/40 px-2 py-1">
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" onClick={onClose} disabled={exporting}>Cancel</Button>
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Exporting…' : 'Export .mxrun'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
