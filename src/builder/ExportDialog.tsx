import { useState } from 'react';
import { useBuilder } from '@/builder/builderContext';
import { downloadRunPacket } from '@/engine/runPacketCodec';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  onClose: () => void;
}

export default function ExportDialog({ onClose }: Props) {
  const { state } = useBuilder();
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleExport() {
    if (!passphrase) { setError('Enter an access code.'); return; }
    if (passphrase !== confirm) { setError('Access codes do not match.'); return; }
    if (passphrase.length < 6) { setError('Access code must be at least 6 characters.'); return; }

    setError('');
    setExporting(true);
    try {
      await downloadRunPacket(state.runPacket, passphrase);
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
      <div className="bg-[var(--color-card)] border border-[var(--color-border)] w-[420px] font-mono">
        {/* Header */}
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
              <div className="text-[10px] text-[var(--color-muted-foreground)] mt-2">
                Give the decker this file and the access code <span className="italic">out-of-band</span>.
              </div>
              <Button className="mt-4" onClick={onClose}>Close</Button>
            </div>
          ) : (
            <>
              <div className="text-[10px] text-[var(--color-muted-foreground)] leading-relaxed">
                The run packet will be AES-GCM encrypted. Only someone with the <span className="text-[var(--color-accent)]">access code</span> can open it.
                Give the code to the decker through secure means — not in the file.
              </div>

              <div>
                <div className="text-[9px] uppercase tracking-wider opacity-50 mb-1">Run Packet Name</div>
                <div className="text-sm text-[var(--color-foreground)] border border-[var(--color-border)] px-2 py-1 bg-[var(--color-background)]">
                  {packetName}
                </div>
              </div>

              <div>
                <div className="text-[9px] uppercase tracking-wider opacity-50 mb-1">Access Code (passphrase)</div>
                <Input
                  type="password"
                  value={passphrase}
                  onChange={e => setPassphrase(e.target.value)}
                  placeholder="Enter a strong passphrase..."
                  autoFocus
                />
              </div>

              <div>
                <div className="text-[9px] uppercase tracking-wider opacity-50 mb-1">Confirm Access Code</div>
                <Input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Confirm passphrase..."
                  onKeyDown={e => e.key === 'Enter' && handleExport()}
                />
              </div>

              {error && (
                <div className="text-[var(--color-alert-active)] text-[10px] border border-[var(--color-alert-active)]/40 px-2 py-1">
                  {error}
                </div>
              )}

              <div className="flex gap-2 justify-end pt-1">
                <Button variant="ghost" onClick={onClose} disabled={exporting}>Cancel</Button>
                <Button onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Encrypting…' : 'Export .mxrun'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
