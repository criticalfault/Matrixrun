import { useMemo } from 'react';
import type { Host, RunnerSession } from '@/types';
import { SECURITY_CODE_COLORS } from '@/data/srTables';
import type { RunnerAction } from '@/runner/runnerContext';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_W  = 148;
const NODE_H  = 58;
const SAN_R   = 26;   // half-size of diamond
const COL_GAP = 60;
const ROW_GAP = 14;
const COL_W   = NODE_W + COL_GAP;
const PADDING = 14;

// A virtual "entry" node representing the RTG or direct-connection origin
interface VirtualEntryNode {
  id: '__entry__';
  label: string;
  sublabel: string;
  color: string;
}

interface NodePos {
  id: string;
  x: number;
  y: number;
  isSAN: boolean;
  isVirtualEntry: boolean;
}

// ─── Layout algorithm ─────────────────────────────────────────────────────────

function buildLayout(
  hosts: Host[],
  entryIds: string[],
  hasVirtualEntry: boolean,
): { positions: Map<string, NodePos>; svgW: number; svgH: number } {
  const hostMap = new Map(hosts.map(h => [h.id, h]));

  // BFS to assign column depths. If we have a virtual entry node, real entry nodes start at col 1.
  const depthOffset = hasVirtualEntry ? 1 : 0;
  const depth = new Map<string, number>();
  const queue = [...entryIds];
  entryIds.forEach(id => depth.set(id, depthOffset));

  while (queue.length) {
    const id = queue.shift()!;
    const h = hostMap.get(id);
    if (!h) continue;
    h.nextHostIds.forEach(nid => {
      if (!depth.has(nid)) {
        depth.set(nid, (depth.get(id) ?? depthOffset) + 1);
        queue.push(nid);
      }
    });
  }

  // Virtual entry sits at col 0
  if (hasVirtualEntry) depth.set('__entry__', 0);

  // Group by column
  const byCol = new Map<number, string[]>();
  depth.forEach((d, id) => {
    if (!byCol.has(d)) byCol.set(d, []);
    byCol.get(d)!.push(id);
  });

  // Compute total height needed per column
  let maxColH = 0;
  byCol.forEach((ids) => {
    const h = ids.reduce((acc, id) => {
      const isSAN = id === '__entry__' ? false :
        hostMap.get(id)?.nodeType === 'san' ||
        hostMap.get(id)?.nodeType === 'one-way-san' ||
        hostMap.get(id)?.nodeType === 'vanishing-san';
      return acc + (isSAN ? SAN_R * 2 : NODE_H) + ROW_GAP;
    }, 0);
    maxColH = Math.max(maxColH, h);
  });

  const positions = new Map<string, NodePos>();
  byCol.forEach((ids, col) => {
    // Centre-align rows within column
    const colH = ids.reduce((acc, id) => {
      const isSAN = id !== '__entry__' && (
        hostMap.get(id)?.nodeType === 'san' ||
        hostMap.get(id)?.nodeType === 'one-way-san' ||
        hostMap.get(id)?.nodeType === 'vanishing-san'
      );
      return acc + (isSAN ? SAN_R * 2 : NODE_H) + ROW_GAP;
    }, 0);
    let y = (maxColH - colH) / 2;

    ids.forEach(id => {
      const isSAN = id !== '__entry__' && (
        hostMap.get(id)?.nodeType === 'san' ||
        hostMap.get(id)?.nodeType === 'one-way-san' ||
        hostMap.get(id)?.nodeType === 'vanishing-san'
      );
      const nodeH = isSAN ? SAN_R * 2 : NODE_H;
      positions.set(id, {
        id,
        x: col * COL_W,
        y,
        isSAN,
        isVirtualEntry: id === '__entry__',
      });
      y += nodeH + ROW_GAP;
    });
  });

  const maxCol = Math.max(...Array.from(depth.values()), 0);
  const svgW = (maxCol + 1) * COL_W + PADDING * 2;
  const svgH = maxColH + PADDING * 2;

  return { positions, svgW, svgH: Math.max(svgH, NODE_H + PADDING * 2) };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface RunnerTopologyMapProps {
  session: RunnerSession;
  dispatch: React.Dispatch<RunnerAction>;
  addLog: (type: import('@/types').LogEntryType, title: string, details?: string) => void;
}

export default function RunnerTopologyMap({ session, dispatch, addLog }: RunnerTopologyMapProps) {
  const hosts     = session.runPacket?.hosts     ?? [];
  const entryIds  = session.runPacket?.entryHostIds ?? [];
  const rtg       = session.runPacket?.rtg;
  const currentId = session.currentHostId;
  const history   = session.hostHistory ?? [];
  const knownNext = session.knownNextHosts ?? {};

  // Build the virtual entry node (RTG or "Direct Entry")
  const virtualEntry: VirtualEntryNode | null = useMemo(() => {
    if (rtg) {
      return {
        id: '__entry__',
        label: rtg.name,
        sublabel: `RTG ${rtg.code}`,
        color: SECURITY_CODE_COLORS[rtg.securityCode],
      };
    }
    return {
      id: '__entry__',
      label: 'DIRECT ENTRY',
      sublabel: 'Air-gapped',
      color: '#22c55e',
    };
  }, [rtg]);

  const { positions, svgW, svgH } = useMemo(
    () => buildLayout(hosts, entryIds, true),
    [hosts, entryIds],
  );

  const hostMap = useMemo(() => new Map(hosts.map(h => [h.id, h])), [hosts]);

  const visitedSet   = new Set(history);
  const deckerKnown  = new Set<string>([...visitedSet]);
  visitedSet.forEach(vid => {
    (knownNext[vid] ?? []).forEach(nid => deckerKnown.add(nid));
  });

  const canGoBack = history.length > 1;

  // Build edge list — include edges from virtual entry to real entry nodes
  const edges: Array<{ fromId: string; toId: string }> = [];
  entryIds.forEach(eid => {
    if (positions.has('__entry__') && positions.has(eid)) {
      edges.push({ fromId: '__entry__', toId: eid });
    }
  });
  hosts.forEach(h => {
    h.nextHostIds.forEach(nid => {
      if (positions.has(h.id) && positions.has(nid)) {
        edges.push({ fromId: h.id, toId: nid });
      }
    });
  });

  function getNodeCenter(id: string): { cx: number; cy: number; rightX: number; leftX: number } {
    const pos = positions.get(id)!;
    const nodeH = pos.isVirtualEntry ? NODE_H : pos.isSAN ? SAN_R * 2 : NODE_H;
    const nodeW = pos.isVirtualEntry ? NODE_W : pos.isSAN ? SAN_R * 2 : NODE_W;
    const cx = PADDING + pos.x + nodeW / 2;
    const cy = PADDING + pos.y + nodeH / 2;
    return { cx, cy, rightX: PADDING + pos.x + nodeW, leftX: PADDING + pos.x };
  }

  function handleNavigate(targetId: string) {
    const target = hostMap.get(targetId);
    if (!target) return;
    dispatch({ type: 'ADVANCE_HOST', payload: targetId });
    addLog('navigation', `→ ${target.name}`, `${target.securityCode} / SV ${target.securityValue}`);
  }

  function handleGoBack() {
    if (!canGoBack) return;
    const prevId = history[history.length - 2];
    const prev = hostMap.get(prevId);
    dispatch({ type: 'GO_BACK' });
    addLog('navigation', `← Back to ${prev?.name ?? prevId}`, 'Alert/tally reset for previous host');
  }

  return (
    <div
      className="border border-[var(--color-border)] bg-[var(--color-card)]"
      style={{ padding: '10px 12px 10px 12px' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] tracking-widest uppercase text-[var(--color-muted-foreground)]">
          NETWORK TOPOLOGY
        </div>
        <div className="flex items-center gap-3 text-[10px]">
          <span className="text-[var(--color-muted-foreground)]">
            <span style={{ color: 'var(--color-primary)' }}>▪</span> Current
            <span className="mx-2 opacity-40">|</span>
            <span className="opacity-60">▪</span> Visited
            <span className="mx-2 opacity-40">|</span>
            <span className="opacity-30">▪</span> Undiscovered
          </span>
          {canGoBack && (
            <button
              onClick={handleGoBack}
              className="border border-[var(--color-border)] px-3 py-0.5 text-[var(--color-muted-foreground)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors tracking-wider"
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* SVG map */}
      <div className="overflow-x-auto">
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          xmlns="http://www.w3.org/2000/svg"
          style={{ display: 'block', fontFamily: 'monospace' }}
        >
          {/* ── Edges ── */}
          {edges.map(({ fromId, toId }) => {
            const from = getNodeCenter(fromId);
            const to   = getNodeCenter(toId);
            const mx   = (from.rightX + to.leftX) / 2;

            const isKnownEdge = deckerKnown.has(toId) || toId === '__entry__';
            const isActiveEdge = (fromId === currentId || toId === currentId) ||
                                 (fromId === '__entry__' && visitedSet.size > 0);
            const edgeColor = isActiveEdge
              ? 'var(--color-primary)'
              : isKnownEdge
              ? '#ffffff40'
              : '#ffffff18';

            return (
              <g key={`${fromId}-${toId}`}>
                <path
                  d={`M ${from.rightX} ${from.cy} C ${mx} ${from.cy}, ${mx} ${to.cy}, ${to.leftX} ${to.cy}`}
                  fill="none"
                  stroke={edgeColor}
                  strokeWidth={isActiveEdge ? 2 : 1}
                  strokeDasharray={isKnownEdge ? undefined : '5 4'}
                />
                <polygon
                  points={`${to.leftX},${to.cy} ${to.leftX - 6},${to.cy - 4} ${to.leftX - 6},${to.cy + 4}`}
                  fill={edgeColor}
                />
              </g>
            );
          })}

          {/* ── Virtual Entry Node ── */}
          {virtualEntry && positions.has('__entry__') && (() => {
            const pos = positions.get('__entry__')!;
            const nx = PADDING + pos.x;
            const ny = PADDING + pos.y;
            const vc = virtualEntry.color;
            return (
              <g key="__entry__">
                <rect x={nx} y={ny} width={NODE_W} height={NODE_H}
                  fill={`${vc}10`} stroke={vc} strokeWidth={1} strokeDasharray="4 2" />
                <text x={nx + 8} y={ny + 20} fontSize={11} fill={vc} fontWeight="bold">
                  {virtualEntry.label.length > 16 ? virtualEntry.label.slice(0, 15) + '…' : virtualEntry.label}
                </text>
                <text x={nx + 8} y={ny + 35} fontSize={10} fill={vc} opacity={0.7}>
                  {virtualEntry.sublabel}
                </text>
                <text x={nx + 8} y={ny + 50} fontSize={9} fill={vc} opacity={0.5}>
                  ENTRY POINT
                </text>
              </g>
            );
          })()}

          {/* ── Host / SAN Nodes ── */}
          {Array.from(positions.values())
            .filter(p => !p.isVirtualEntry)
            .map((pos) => {
              const h = hostMap.get(pos.id);
              if (!h) return null;

              const isCurrent   = pos.id === currentId;
              const isVisited   = visitedSet.has(pos.id) && !isCurrent;
              const isKnown     = deckerKnown.has(pos.id);
              const secColor    = SECURITY_CODE_COLORS[h.securityCode];

              const currentNextIds = knownNext[currentId] ?? [];
              const isNavigable = currentNextIds.includes(pos.id) && !isCurrent;

              const nx = PADDING + pos.x;
              const ny = PADDING + pos.y;

              // ── SAN node (diamond) ──
              if (pos.isSAN) {
                const cx = nx + SAN_R;
                const cy = ny + SAN_R;
                const r  = SAN_R;
                const bc = isCurrent ? 'var(--color-primary)' : isKnown ? secColor : '#ffffff28';
                const fc = isCurrent ? 'var(--color-primary)20' : 'transparent';
                return (
                  <g key={pos.id}
                    style={{ cursor: isNavigable ? 'pointer' : 'default' }}
                    onClick={isNavigable ? () => handleNavigate(pos.id) : undefined}>
                    <polygon
                      points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
                      fill={fc} stroke={bc} strokeWidth={isCurrent ? 2.5 : 1.5} />
                    <text x={cx} y={cy - 4} textAnchor="middle" fontSize={10}
                      fill={isCurrent ? 'var(--color-primary)' : isKnown ? secColor : '#ffffff40'}
                      fontWeight="bold">
                      SAN
                    </text>
                    <text x={cx} y={cy + 9} textAnchor="middle" fontSize={9}
                      fill={isCurrent ? 'var(--color-primary)' : isKnown ? secColor : '#ffffff30'}>
                      {isKnown ? `${h.securityCode[0]}-${h.securityValue}` : '?'}
                    </text>
                    {isCurrent && (
                      <text x={cx} y={cy + r + 13} textAnchor="middle" fontSize={9}
                        fill="var(--color-primary)" opacity={0.8}>▲ HERE</text>
                    )}
                    {isNavigable && (
                      <text x={cx} y={cy + r + 13} textAnchor="middle" fontSize={9}
                        fill={secColor} opacity={0.9}>→ ENTER</text>
                    )}
                  </g>
                );
              }

              // ── Regular host node (rectangle) ──
              const nodeColor  = isCurrent ? 'var(--color-primary)' : isKnown ? 'var(--color-foreground)' : '#ffffff28';
              const nodeFill   = isCurrent ? 'var(--color-primary)10' : 'var(--color-background)';
              const label      = isKnown ? h.name : '???';

              return (
                <g key={pos.id}
                  style={{ cursor: isNavigable ? 'pointer' : 'default' }}
                  onClick={isNavigable ? () => handleNavigate(pos.id) : undefined}>

                  {/* Glow halo on current */}
                  {isCurrent && (
                    <rect x={nx - 2} y={ny - 2} width={NODE_W + 4} height={NODE_H + 4}
                      fill="none" stroke="var(--color-primary)" strokeWidth={1} opacity={0.25} />
                  )}

                  <rect x={nx} y={ny} width={NODE_W} height={NODE_H}
                    fill={nodeFill} stroke={nodeColor} strokeWidth={isCurrent ? 2 : 1} />

                  {/* Security badge top-right */}
                  {isKnown && (
                    <g>
                      <rect x={nx + NODE_W - 30} y={ny + 5} width={26} height={14}
                        fill={`${secColor}22`} stroke={secColor} strokeWidth={0.5} />
                      <text x={nx + NODE_W - 17} y={ny + 15} textAnchor="middle"
                        fontSize={9} fill={secColor} fontWeight="bold">
                        {h.securityCode[0]}-{h.securityValue}
                      </text>
                    </g>
                  )}

                  {/* Host name */}
                  <text x={nx + 7} y={ny + 18} fontSize={11} fill={nodeColor} fontWeight="bold">
                    {label.length > 15 ? label.slice(0, 14) + '…' : label}
                  </text>

                  {/* Subsystem mini-row */}
                  {isKnown && (
                    <text x={nx + 7} y={ny + 33} fontSize={9}
                      fill={isVisited || isCurrent ? '#ffffff55' : '#ffffff22'}>
                      {`ACC ${h.subsystems.access}  FIL ${h.subsystems.files}  CTL ${h.subsystems.control}  IDX ${h.subsystems.index}  SLV ${h.subsystems.slave}`}
                    </text>
                  )}

                  {/* Status label bottom */}
                  {isCurrent && (
                    <text x={nx + NODE_W / 2} y={ny + NODE_H - 6} textAnchor="middle"
                      fontSize={9} fill="var(--color-primary)" opacity={0.85} fontWeight="bold">
                      ▲ YOU ARE HERE
                    </text>
                  )}
                  {isNavigable && (
                    <text x={nx + NODE_W / 2} y={ny + NODE_H - 6} textAnchor="middle"
                      fontSize={9} fill={secColor} opacity={0.9}>
                      → CLICK TO ENTER
                    </text>
                  )}
                  {!isKnown && !isCurrent && (
                    <text x={nx + NODE_W / 2} y={ny + NODE_H / 2 + 4} textAnchor="middle"
                      fontSize={10} fill="#ffffff30">
                      UNDISCOVERED
                    </text>
                  )}
                </g>
              );
            })}
        </svg>
      </div>
    </div>
  );
}
