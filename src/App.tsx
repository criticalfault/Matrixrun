import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom'
import BuilderPage from '@/builder/BuilderPage'
import RunnerPage from '@/runner/RunnerPage'
import { Separator } from '@/components/ui/separator'

// ─── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden scanlines">
      {/* Background grid effect */}
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

      <div className="relative z-10 flex flex-col items-center gap-8 p-8">
        <div className="text-center">
          <div className="text-xs tracking-[0.5em] text-[var(--color-muted-foreground)] mb-2 uppercase">
            Shadowrun 3rd Edition
          </div>
          <h1
            className="text-6xl font-mono font-bold tracking-tight matrix-glow"
            style={{ color: 'var(--color-primary)' }}
          >
            MATRIX<span style={{ color: 'var(--color-accent)' }}>RUN</span>
          </h1>
          <div className="text-xs tracking-[0.3em] text-[var(--color-muted-foreground)] mt-2 uppercase">
            Matrix Host Builder &amp; Runner
          </div>
        </div>

        <Separator className="w-64" />

        <div className="flex flex-col gap-4 w-full max-w-xs">
          <ModeButton
            label="[ BUILDER ]"
            sublabel="GM — Construct host run packets"
            onClick={() => navigate('/builder')}
            primary
          />
          <ModeButton
            label="[ RUNNER ]"
            sublabel="Decker — Jack in and run the Matrix"
            onClick={() => navigate('/runner')}
            primary={false}
          />
        </div>

        <Separator className="w-64" />

        <div className="text-[10px] text-[var(--color-muted-foreground)] text-center tracking-widest">
          <span>SR3 MATRIX RULES ENGINE v1.0</span>
          <br />
          <span className="opacity-50">The Matrix has you.</span>
        </div>
      </div>
    </div>
  )
}

function ModeButton({
  label, sublabel, onClick, primary,
}: {
  label: string
  sublabel: string
  onClick: () => void
  primary: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'group w-full p-4 border font-mono text-left transition-all duration-150',
        primary
          ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/15'
          : 'border-[var(--color-border)] bg-transparent hover:border-[var(--color-primary)] hover:bg-[var(--color-primary)]/5',
      ].join(' ')}
    >
      <div className={[
        'text-sm font-bold tracking-widest',
        primary
          ? 'text-[var(--color-primary)] matrix-glow'
          : 'text-[var(--color-foreground)] group-hover:text-[var(--color-primary)]',
      ].join(' ')}>
        {label}
      </div>
      <div className="text-[10px] text-[var(--color-muted-foreground)] mt-1 tracking-wider">
        {sublabel}
      </div>
    </button>
  )
}


// ─── Root ─────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/builder/*" element={<BuilderPage />} />
        <Route path="/runner/*" element={<RunnerPage />} />
      </Routes>
    </BrowserRouter>
  )
}
