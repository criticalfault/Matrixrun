import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRunner } from '@/runner/runnerContext';
import type { RunPacket, CharacterSheet } from '@/types';
import { importRunPacket, listBuilderDrafts, loadBuilderDraft } from '@/engine/runPacketCodec';

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_RUN_PACKET: RunPacket = {
  id: 'demo-001',
  name: 'Demo Run',
  description: 'A sample run for testing.',
  version: '1.0',
  entryHostIds: ['host-demo-1'],
  hosts: [
    {
      id: 'host-demo-1',
      name: 'AZTECHNOLOGY DEMO NODE',
      description: 'A basic Blue-rated test host.',
      securityCode: 'Blue',
      securityValue: 4,
      subsystems: { access: 4, files: 4, slave: 4, index: 4, control: 4 },
      subsystemVariants: [],
      securitySheaf: [
        {
          id: 'step-1',
          triggerValue: 6,
          ic: [
            {
              id: 'ic-probe-1',
              type: 'Probe',
              category: 'ReactiveWhite',
              rating: 4,
              options: [],
              isConstruct: false,
              status: 'dormant',
              currentRating: 4,
            },
          ],
        },
        {
          id: 'step-2',
          triggerValue: 12,
          alertChange: 'passive',
          ic: [],
        },
      ],
      paydata: [],
      files: [],
      slaves: [],
      nextHostIds: [],
      specialFeatures: {},
    },
  ],
  createdAt: Date.now(),
};

const DEMO_CHARACTER: CharacterSheet = {
  name: 'Ghost',
  streetName: 'Ghost',
  race: 'Human',
  attributes: {
    body: 4,
    quickness: 4,
    strength: 3,
    charisma: 3,
    willpower: 4,
    intelligence: 5,
    reaction: 4,
    essence: 6,
  },
  deck: {
    name: 'Fairlight Excalibur',
    persona: 6,
    bod: 4,
    evasion: 4,
    sensors: 4,
    masking: 4,
    hardening: 3,
    activeMemoryMp: 300,
    storageMemoryMp: 600,
    ioSpeed: 60,
    responseIncrease: 2,
  },
  programs: [
    { name: 'Attack', multiplier: 1, rating: 5, loaded: true, sizeMp: 15 },
    { name: 'Browse', multiplier: 1, rating: 4, loaded: true, sizeMp: 12 },
    { name: 'Sleaze', multiplier: 1, rating: 4, loaded: true, sizeMp: 12 },
  ],
  hackingPool: 6,
  computerSkill: 5,
  electronicsSkill: 4,
  isVerified: false,
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoginView() {
  const navigate = useNavigate();
  const { dispatch } = useRunner();

  const [runPacket, setRunPacket] = useState<RunPacket | null>(null);
  const [character, setCharacter] = useState<CharacterSheet | null>(null);
  const [runPacketName, setRunPacketName] = useState('');
  const [characterFileName, setCharacterFileName] = useState('');
  const [runPacketError, setRunPacketError] = useState('');
  const [characterError, setCharacterError] = useState('');

  // .mxrun decrypt flow
  const [pendingMxrunFile, setPendingMxrunFile] = useState<File | null>(null);
  const [mxrunPassphrase, setMxrunPassphrase] = useState('');
  const [mxrunDecrypting, setMxrunDecrypting] = useState(false);
  const [mxrunError, setMxrunError] = useState('');

  // Source tracking and builder drawer
  const [runPacketSource, setRunPacketSource] = useState<'mxrun' | 'json' | 'builder' | null>(null);
  const [builderDrawerOpen, setBuilderDrawerOpen] = useState(false);

  const runPacketRef = useRef<HTMLInputElement>(null);
  const characterRef = useRef<HTMLInputElement>(null);

  function handleRunPacketFile(file: File) {
    setRunPacketError('');
    setRunPacket(null);
    setRunPacketName(file.name);
    setRunPacketSource(null);

    if (file.name.endsWith('.mxrun')) {
      setPendingMxrunFile(file);
      setMxrunPassphrase('');
      setMxrunError('');
    } else {
      // Plain JSON path
      setPendingMxrunFile(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target?.result as string) as RunPacket;
          setRunPacket(parsed);
          setRunPacketSource('json');
        } catch {
          setRunPacketError('Invalid JSON file');
        }
      };
      reader.readAsText(file);
    }
  }

  async function handleDecrypt() {
    if (!pendingMxrunFile || !mxrunPassphrase) return;
    setMxrunDecrypting(true);
    setMxrunError('');
    try {
      const packet = await importRunPacket(pendingMxrunFile, mxrunPassphrase);
      setRunPacket(packet);
      setRunPacketSource('mxrun');
      setRunPacketName(pendingMxrunFile.name);
      setPendingMxrunFile(null);
      setMxrunPassphrase('');
    } catch (e) {
      setMxrunError(String(e).replace('Error: ', ''));
    } finally {
      setMxrunDecrypting(false);
    }
  }

  function loadFromBuilder(id: string) {
    const draft = loadBuilderDraft(id);
    if (!draft) return;
    setRunPacket(draft as RunPacket);
    setRunPacketSource('builder');
    setRunPacketName(draft.name);
    setRunPacketError('');
    setPendingMxrunFile(null);
    setBuilderDrawerOpen(false);
  }

  function handleCharacterFile(file: File) {
    setCharacterError('');
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target?.result as string) as CharacterSheet;
        setCharacter(parsed);
        setCharacterFileName(file.name);
      } catch {
        setCharacterError('Invalid JSON file');
      }
    };
    reader.readAsText(file);
  }

  function loadDemo() {
    setRunPacket(DEMO_RUN_PACKET);
    setRunPacketName('demo-run-packet.json');
    setRunPacketSource('json');
    setCharacter(DEMO_CHARACTER);
    setCharacterFileName('ghost-decker.json');
    setRunPacketError('');
    setCharacterError('');
    setPendingMxrunFile(null);
    setMxrunError('');
  }

  function jackIn() {
    if (!runPacket || !character) return;
    dispatch({ type: 'LOGIN', payload: { runPacket, character } });
  }

  const canJackIn = runPacket !== null && character !== null;
  const builderDrafts = builderDrawerOpen ? listBuilderDrafts() : [];

  // Source badge label
  const sourceBadge =
    runPacketSource === 'mxrun' ? 'via .mxrun' :
    runPacketSource === 'json' ? 'via .json' :
    runPacketSource === 'builder' ? 'via Builder' :
    null;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden scanlines font-mono">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `
            linear-gradient(var(--color-primary) 1px, transparent 1px),
            linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 w-full max-w-2xl px-6 flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <div className="text-[10px] tracking-[0.4em] text-[var(--color-muted-foreground)] uppercase mb-1">
            MatrixRun // Runner Mode
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--color-primary)', textShadow: '0 0 12px var(--color-primary)' }}>
            JACK IN
          </h1>
          <div className="text-xs text-[var(--color-muted-foreground)] mt-1 tracking-wider">
            Load run packet and decker profile to begin
          </div>
        </div>

        {/* Upload panels */}
        <div className="grid grid-cols-2 gap-4">
          {/* Run Packet */}
          <UploadPanel
            title="RUN PACKET"
            description="GM-exported run packet (.json or .mxrun)"
            fileName={runPacketName}
            fileLabel={runPacket ? runPacket.name : (pendingMxrunFile ? pendingMxrunFile.name : null)}
            fileLabelNote={sourceBadge}
            pendingDecrypt={pendingMxrunFile !== null}
            error={runPacketError}
            onClick={() => runPacketRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleRunPacketFile(file);
            }}
          />
          <input
            ref={runPacketRef}
            type="file"
            accept=".json,.mxrun"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleRunPacketFile(file);
              // Reset input so re-selecting same file fires onChange
              e.target.value = '';
            }}
          />

          {/* Character */}
          <UploadPanel
            title="DECKER PROFILE"
            description="Character sheet JSON"
            fileName={characterFileName}
            fileLabel={character ? `${character.streetName} // ${character.deck.name}` : null}
            fileLabelNote={null}
            pendingDecrypt={false}
            error={characterError}
            onClick={() => characterRef.current?.click()}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files[0];
              if (file) handleCharacterFile(file);
            }}
          />
          <input
            ref={characterRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleCharacterFile(file);
              e.target.value = '';
            }}
          />
        </div>

        {/* Passphrase section — shown only when a .mxrun file is pending */}
        {pendingMxrunFile !== null && (
          <div
            className="border p-4 flex flex-col gap-3"
            style={{ borderColor: 'var(--color-accent, var(--color-primary))' }}
          >
            <div className="text-[10px] tracking-widest uppercase" style={{ color: 'var(--color-accent, var(--color-primary))' }}>
              Access Code Required
            </div>
            <div className="flex gap-2 items-center">
              <input
                type="password"
                value={mxrunPassphrase}
                onChange={(e) => setMxrunPassphrase(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleDecrypt(); }}
                placeholder="Enter access code…"
                disabled={mxrunDecrypting}
                className="flex-1 bg-transparent border px-3 py-2 text-xs font-mono tracking-wider outline-none disabled:opacity-50"
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-foreground)',
                }}
              />
              <button
                onClick={handleDecrypt}
                disabled={!mxrunPassphrase || mxrunDecrypting}
                className="px-4 py-2 text-xs font-mono font-bold tracking-widest border transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  borderColor: 'var(--color-accent, var(--color-primary))',
                  color: 'var(--color-accent, var(--color-primary))',
                  backgroundColor: 'color-mix(in srgb, var(--color-accent, var(--color-primary)) 10%, transparent)',
                }}
              >
                {mxrunDecrypting ? 'Decrypting…' : '[ DECRYPT ]'}
              </button>
            </div>
            {mxrunError && (
              <div className="text-[11px]" style={{ color: '#ef4444' }}>
                {mxrunError}
              </div>
            )}
          </div>
        )}

        {/* Builder drawer */}
        <div className="flex flex-col gap-0">
          <button
            onClick={() => setBuilderDrawerOpen((v) => !v)}
            className="text-xs tracking-wider text-left px-0 py-1 transition-colors"
            style={{ color: 'var(--color-muted-foreground)' }}
          >
            [ {builderDrawerOpen ? '▾' : '▸'} Load from Builder (same device) ]
          </button>
          {builderDrawerOpen && (
            <div
              className="border mt-1 p-3 flex flex-col gap-2"
              style={{ borderColor: 'var(--color-border)' }}
            >
              {builderDrafts.length === 0 ? (
                <div className="text-[11px] text-[var(--color-muted-foreground)]">No saved drafts found.</div>
              ) : (
                builderDrafts.map((draft) => (
                  <button
                    key={draft.id}
                    onClick={() => loadFromBuilder(draft.id)}
                    className="flex items-center justify-between text-left px-3 py-2 border transition-all"
                    style={{
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-foreground)',
                      backgroundColor: 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-primary)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-primary)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--color-border)';
                      (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-foreground)';
                    }}
                  >
                    <span className="text-xs font-bold tracking-wide">{draft.name}</span>
                    <span className="text-[10px] text-[var(--color-muted-foreground)]">
                      {new Date(draft.createdAt).toLocaleDateString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 items-center">
          <button
            onClick={jackIn}
            disabled={!canJackIn}
            className="w-full py-3 font-mono font-bold text-sm tracking-widest border transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              borderColor: canJackIn ? 'var(--color-primary)' : 'var(--color-border)',
              color: canJackIn ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
              backgroundColor: canJackIn ? 'color-mix(in srgb, var(--color-primary) 10%, transparent)' : 'transparent',
              boxShadow: canJackIn ? '0 0 12px color-mix(in srgb, var(--color-primary) 30%, transparent)' : 'none',
            }}
          >
            [ JACK IN → ]
          </button>

          <button
            onClick={loadDemo}
            className="text-xs tracking-wider text-[var(--color-muted-foreground)] border border-[var(--color-border)] px-4 py-2 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
          >
            [ LOAD DEMO ]
          </button>

          <button
            onClick={() => navigate('/')}
            className="text-xs text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)] transition-colors"
          >
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Upload Panel ─────────────────────────────────────────────────────────────

function UploadPanel({
  title, description, fileName, fileLabel, fileLabelNote, pendingDecrypt, error, onClick, onDrop,
}: {
  title: string;
  description: string;
  fileName: string;
  fileLabel: string | null;
  fileLabelNote: string | null;
  pendingDecrypt: boolean;
  error: string;
  onClick: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const isLoaded = fileLabel !== null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { setDragOver(false); onDrop(e); }}
      className="border p-4 flex flex-col gap-2 cursor-pointer transition-all min-h-[120px] select-none"
      style={{
        borderColor: error ? '#ef4444'
          : dragOver ? 'var(--color-primary)'
          : pendingDecrypt ? 'var(--color-accent, var(--color-primary))'
          : isLoaded ? 'var(--color-primary)'
          : 'var(--color-border)',
        backgroundColor: dragOver ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)'
          : isLoaded ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)'
          : 'transparent',
      }}
    >
      <div className="text-[10px] tracking-widest uppercase" style={{ color: isLoaded ? 'var(--color-primary)' : 'var(--color-muted-foreground)' }}>
        {title}
      </div>
      {isLoaded ? (
        <>
          <div className="flex items-center gap-2">
            <div className="text-xs font-bold" style={{ color: 'var(--color-foreground)' }}>{fileLabel}</div>
            {fileLabelNote && (
              <span
                className="text-[9px] px-1 py-0.5 border tracking-wide"
                style={{ borderColor: 'var(--color-primary)', color: 'var(--color-primary)' }}
              >
                {fileLabelNote}
              </span>
            )}
          </div>
          <div className="text-[10px] text-[var(--color-muted-foreground)] truncate">{fileName}</div>
        </>
      ) : pendingDecrypt ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2">
          <div className="text-[10px] tracking-widest" style={{ color: 'var(--color-accent, var(--color-primary))' }}>
            ENCRYPTED — enter access code below
          </div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] truncate">{fileName}</div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 py-2">
          <div className="text-2xl opacity-30" style={{ color: 'var(--color-primary)' }}>↑</div>
          <div className="text-[10px] text-[var(--color-muted-foreground)] text-center">{description}</div>
          <div className="text-[9px] text-[var(--color-muted-foreground)] opacity-60">drag & drop or click</div>
        </div>
      )}
      {error && (
        <div className="text-[10px]" style={{ color: '#ef4444' }}>{error}</div>
      )}
    </div>
  );
}
