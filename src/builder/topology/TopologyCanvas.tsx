import { useMemo, useRef, useState, useCallback } from 'react';
import type { Host, RTGEntry } from '@/types';
import { useBuilder } from '@/builder/builderContext';
import { SECURITY_CODE_COLORS } from '@/data/srTables';
import { cn } from '@/lib/utils';

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_W = 196;
const NODE_H = 108;
const SAN_SIZE = 72;        // bounding box for diamond
const COL_GAP = 80;
const ROW_GAP = 16;
const RTG_W = 120;
const RTG_H = 108;
const RTG_GAP = 60;
const CANVAS_PAD = 48;

// ─── Layout algorithm ─────────────────────────────────────────────────────────

interface NodePos { x: number; y: number; w: number; h: number; }

const SAN_TYPES = new Set(['san', 'one-way-san', 'vanishing-san', 'ltg', 'pltg']);

function nodeSize(host: Host): { w: number; h: number } {
  return SAN_TYPES.has(host.nodeType ?? '')
    ? { w: SAN_SIZE, h: SAN_SIZE }
    : { w: NODE_W, h: NODE_H };
}

function computeLayout(
  hosts: Host[],
  entryHostIds: string[],
  hasRTG: boolean,
): { positions: Map<string, NodePos>; rtgPos: NodePos | null; totalW: number; totalH: number } {
  // BFS to assign column depth
  const depth = new Map<string, number>();
  const queue = [...entryHostIds];
  entryHostIds.forEach(id => depth.set(id, 0));

  while (queue.length > 0) {
    const id = queue.shift()!;
    const host = hosts.find(h => h.id === id);
    if (!host) continue;
    const d = depth.get(id) ?? 0;
    for (const nid of host.nextHostIds) {
      if (!depth.has(nid)) {
        depth.set(nid, d + 1);
        queue.push(nid);
      }
    }
  }

  hosts.forEach(h => { if (!depth.has(h.id)) depth.set(h.id, 0); });

  const cols = new Map<number, string[]>();
  depth.forEach((d, id) => {
    if (!cols.has(d)) cols.set(d, []);
    cols.get(d)!.push(id);
  });

  const maxCol = cols.size > 0 ? Math.max(...Array.from(cols.keys())) : -1;
  const startX = hasRTG ? CANVAS_PAD + RTG_W + RTG_GAP : CANVAS_PAD;

  const positions = new Map<string, NodePos>();
  let maxRowHeight = 0;

  cols.forEach((ids, col) => {
    const colH = ids.reduce((sum, id) => {
      const h = hosts.find(n => n.id === id);
      return sum + (h ? nodeSize(h).h : NODE_H);
    }, 0) + (ids.length - 1) * ROW_GAP;
    maxRowHeight = Math.max(maxRowHeight, colH);
    let rowY = CANVAS_PAD;
    ids.forEach(id => {
      const host = hosts.find(n => n.id === id);
      const { w, h } = host ? nodeSize(host) : { w: NODE_W, h: NODE_H };
      // If node has a position override, use it; otherwise auto-layout
      if (host?.position) {
        positions.set(id, { x: host.position.x, y: host.position.y, w, h });
      } else {
        positions.set(id, { x: startX + col * (NODE_W + COL_GAP), y: rowY, w, h });
      }
      rowY += h + ROW_GAP;
    });
  });

  const rtgPos: NodePos | null = hasRTG
    ? { x: CANVAS_PAD, y: Math.max(CANVAS_PAD, CANVAS_PAD + (maxRowHeight - RTG_H) / 2), w: RTG_W, h: RTG_H }
    : null;

  const colCount = maxCol >= 0 ? maxCol + 1 : 0;
  const totalW = startX + colCount * NODE_W + Math.max(0, colCount - 1) * COL_GAP + CANVAS_PAD;
  const totalH = Math.max(maxRowHeight, RTG_H) + CANVAS_PAD * 2;

  return { positions, rtgPos, totalW: Math.max(totalW, 400), totalH: Math.max(totalH, 200) };
}

// ─── Bezier path ──────────────────────────────────────────────────────────────

function makePath(from: NodePos, to: NodePos): string {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  const cp = Math.abs(x2 - x1) * 0.5;
  return `M ${x1} ${y1} C ${x1 + cp} ${y1}, ${x2 - cp} ${y2}, ${x2} ${y2}`;
}

// ─── SAN diamond node ─────────────────────────────────────────────────────────

function SANNode({
  host, pos, isSelected, isEntry, onClick,
  dragHandleProps,
}: {
  host: Host;
  pos: NodePos;
  isSelected: boolean;
  isEntry: boolean;
  onClick: () => void;
  dragHandleProps: React.SVGAttributes<SVGRectElement>;
}) {
  const nodeType = host.nodeType ?? 'san';
  const cx = pos.x + pos.w / 2;
  const cy = pos.y + pos.h / 2;
  const half = pos.w / 2 - 4;

  // Color by type
  const baseColor =
    nodeType === 'vanishing-san' ? '#f59e0b' :
    nodeType === 'one-way-san'   ? '#38bdf8' :
    nodeType === 'ltg'           ? '#14b8a6' :
    nodeType === 'pltg'          ? '#6366f1' :
    '#38bdf8'; // plain san

  const strokeColor = isSelected ? 'var(--color-primary)' : baseColor;
  const fillColor = isSelected ? `${strokeColor}22` : `${baseColor}11`;

  const isLTGlike = nodeType === 'ltg' || nodeType === 'pltg';
  const isDashed = nodeType === 'vanishing-san';

  // Hexagon points for LTG/PLTG
  const hexPoints = `${cx},${cy-30} ${cx+35},${cy-15} ${cx+35},${cy+15} ${cx},${cy+30} ${cx-35},${cy+15} ${cx-35},${cy-15}`;
  // Diamond points
  const diamondPoints = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;

  const labelMap: Partial<Record<string, string>> = {
    'san': 'SAN',
    'one-way-san': '→SAN',
    'vanishing-san': '⏱SAN',
    'ltg': 'LTG',
    'pltg': '🔒PLTG',
  };
  const defaultNames = new Set(['SAN','One-Way SAN','Vanishing SAN','LTG','PLTG']);

  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      {isLTGlike ? (
        <polygon
          points={hexPoints}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 2 : 1.5}
        />
      ) : (
        <polygon
          points={diamondPoints}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={isSelected ? 2 : 1.5}
          strokeDasharray={isDashed ? '5 3' : undefined}
        />
      )}
      {/* Label */}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={strokeColor}
        fontFamily="Courier New"
        fontSize="9"
        fontWeight="bold"
        letterSpacing="1"
      >
        {labelMap[nodeType] ?? 'SAN'}
      </text>
      <text
        x={cx}
        y={cy + 8}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-muted-foreground)"
        fontFamily="Courier New"
        fontSize="8"
      >
        {!defaultNames.has(host.name) ? host.name : ''}
      </text>
      {isEntry && (
        <text
          x={cx}
          y={pos.y + pos.h + 10}
          textAnchor="middle"
          fill="var(--color-primary)"
          fontFamily="Courier New"
          fontSize="8"
        >
          ENTRY
        </text>
      )}
      {/* Transparent drag + click rect */}
      <rect
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={pos.h}
        fill="transparent"
        {...dragHandleProps}
      />
    </g>
  );
}

// ─── Host node card ───────────────────────────────────────────────────────────

function HostNodeCard({
  host, pos, isSelected, isEntry, onClick,
  dragHandleProps,
}: {
  host: Host;
  pos: NodePos;
  isSelected: boolean;
  isEntry: boolean;
  onClick: () => void;
  dragHandleProps: React.SVGAttributes<SVGRectElement>;
}) {
  const color = SECURITY_CODE_COLORS[host.securityCode];
  const ss = host.subsystems;

  return (
    <g>
      <foreignObject x={pos.x} y={pos.y} width={pos.w} height={pos.h}>
        <div
          onClick={onClick}
          className={cn(
            'w-full h-full select-none font-mono text-[10px] overflow-hidden',
            'border transition-all duration-100',
            isSelected
              ? 'border-[var(--color-primary)] bg-[var(--color-card)]'
              : 'border-[var(--color-border)] bg-[var(--color-card)]',
          )}
          style={{ boxShadow: isSelected ? `0 0 8px ${color}44` : undefined }}
        >
          <div
            className="px-2 py-1 flex items-center justify-between"
            style={{ backgroundColor: `${color}22`, borderBottom: `1px solid ${color}44` }}
          >
            <span className="font-bold tracking-wider truncate" style={{ color }}>
              {host.name}
            </span>
            <span className="text-[9px] opacity-70 ml-1 shrink-0" style={{ color }}>
              {host.securityCode[0]}-{host.securityValue}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 px-2 py-1.5 text-[var(--color-foreground)]">
            <div><span className="opacity-50">ACC </span>{ss.access}</div>
            <div><span className="opacity-50">FIL </span>{ss.files}</div>
            <div><span className="opacity-50">CTL </span>{ss.control}</div>
            <div><span className="opacity-50">SLV </span>{ss.slave}</div>
            <div><span className="opacity-50">IDX </span>{ss.index}</div>
            <div className="text-[8px] opacity-40 flex items-end">
              {host.securitySheaf.length > 0 && `${host.securitySheaf.length} steps`}
            </div>
          </div>
          {isEntry && (
            <div
              className="absolute bottom-0 right-0 text-[8px] px-1 py-0.5"
              style={{ color: 'var(--color-primary)', backgroundColor: 'var(--color-background)' }}
            >
              ENTRY
            </div>
          )}
        </div>
      </foreignObject>
      {/* Transparent drag handle on top of foreignObject */}
      <rect
        x={pos.x}
        y={pos.y}
        width={pos.w}
        height={14}
        fill="transparent"
        style={{ cursor: 'grab' }}
        {...dragHandleProps}
      />
    </g>
  );
}

// ─── RTG node ─────────────────────────────────────────────────────────────────

function RTGNodeCard({ rtg, pos }: { rtg: RTGEntry; pos: NodePos }) {
  const color = SECURITY_CODE_COLORS[rtg.securityCode];
  return (
    <foreignObject x={pos.x} y={pos.y} width={pos.w} height={pos.h}>
      <div
        className="w-full h-full font-mono text-[10px] border flex flex-col items-center justify-center gap-1"
        style={{ borderColor: color, backgroundColor: `${color}11` }}
      >
        <div className="text-xl opacity-60">◎</div>
        <div className="font-bold text-center leading-tight px-1 text-[9px]" style={{ color }}>
          {rtg.name}
        </div>
        <div className="text-[8px] opacity-50">{rtg.securityCode}-{rtg.securityValue}</div>
      </div>
    </foreignObject>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────

interface DragState {
  id: string;
  startMouseX: number;
  startMouseY: number;
  origX: number;
  origY: number;
}

export default function TopologyCanvas() {
  const { state, dispatch, selectedHost } = useBuilder();
  const { runPacket } = state;
  const svgRef = useRef<SVGSVGElement>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [livePos, setLivePos] = useState<{ x: number; y: number } | null>(null);

  const { positions, rtgPos, totalW, totalH } = useMemo(
    () => computeLayout(runPacket.hosts, runPacket.entryHostIds, !!runPacket.rtg),
    [runPacket.hosts, runPacket.entryHostIds, runPacket.rtg],
  );

  // Effective position for a node (live drag overrides saved position overrides auto-layout)
  function getPos(id: string): NodePos | undefined {
    if (drag?.id === id && livePos) {
      const base = positions.get(id);
      if (!base) return undefined;
      return { ...base, x: livePos.x, y: livePos.y };
    }
    return positions.get(id);
  }

  function svgPoint(e: React.MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: e.clientX, y: e.clientY };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  }

  function handleNodeClick(id: string) {
    if (drag && livePos) return; // don't register click at end of drag
    if (connectFrom && connectFrom !== id) {
      dispatch({ type: 'ADD_CONNECTION', payload: { fromId: connectFrom, toId: id } });
      setConnectFrom(null);
    } else {
      dispatch({ type: 'SELECT_HOST', payload: id });
      setConnectFrom(null);
    }
  }

  const startDrag = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const { x, y } = svgPoint(e);
    const pos = positions.get(id);
    if (!pos) return;
    setDrag({ id, startMouseX: x, startMouseY: y, origX: pos.x, origY: pos.y });
    setLivePos({ x: pos.x, y: pos.y });
  }, [positions]);

  function handleSVGMouseMove(e: React.MouseEvent) {
    if (!drag) return;
    const { x, y } = svgPoint(e);
    const dx = x - drag.startMouseX;
    const dy = y - drag.startMouseY;
    setLivePos({ x: Math.max(0, drag.origX + dx), y: Math.max(0, drag.origY + dy) });
  }

  function handleSVGMouseUp() {
    if (drag && livePos) {
      const moved = Math.abs(livePos.x - drag.origX) > 4 || Math.abs(livePos.y - drag.origY) > 4;
      if (moved) {
        dispatch({ type: 'MOVE_NODE', payload: { id: drag.id, x: Math.round(livePos.x), y: Math.round(livePos.y) } });
      }
    }
    setDrag(null);
    setLivePos(null);
  }

  const isSAN = (h: Host) => SAN_TYPES.has(h.nodeType ?? '');

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden bg-[var(--color-background)]">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--color-border)] bg-[var(--color-card)] shrink-0 flex-wrap">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-muted-foreground)]">
          Topology
        </span>
        <div className="flex-1" />

        {connectFrom && (
          <span className="text-[10px] text-[var(--color-alert-passive)] animate-pulse">
            Click target node to connect — or same node to cancel
          </span>
        )}

        {selectedHost && !connectFrom && (
          <button
            onClick={() => setConnectFrom(selectedHost.id)}
            className="text-[10px] border border-[var(--color-border)] px-2 py-0.5 hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] font-mono uppercase tracking-wider"
          >
            + Connect →
          </button>
        )}

        {selectedHost && !isSAN(selectedHost) && (
          <button
            onClick={() => dispatch({ type: 'SET_ENTRY_HOST', payload: selectedHost.id })}
            className={cn(
              'text-[10px] border px-2 py-0.5 font-mono uppercase tracking-wider',
              runPacket.entryHostIds.includes(selectedHost.id)
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
            )}
          >
            ⊞ Entry
          </button>
        )}

        {selectedHost && (
          <button
            onClick={() => {
              if (confirm(`Delete "${selectedHost.name}"?`)) {
                dispatch({ type: 'DELETE_HOST', payload: selectedHost.id });
              }
            }}
            className="text-[10px] border border-[var(--color-border)] px-2 py-0.5 hover:border-[var(--color-alert-active)] hover:text-[var(--color-alert-active)] font-mono uppercase tracking-wider"
          >
            ✕ Delete
          </button>
        )}

        <button
          onClick={() => dispatch({ type: 'ADD_SAN', payload: { sanType: 'san' } })}
          className="text-[10px] border border-[#38bdf8] text-[#38bdf8] px-2 py-0.5 hover:bg-[#38bdf8]/10 font-mono uppercase tracking-wider"
          title="Add a SAN (System Access Node)"
        >
          + SAN
        </button>
        <button
          onClick={() => dispatch({ type: 'ADD_SAN', payload: { sanType: 'one-way-san' } })}
          className="text-[10px] border border-dashed border-[#38bdf8] text-[#38bdf8] px-2 py-0.5 hover:bg-[#38bdf8]/10 font-mono uppercase tracking-wider"
          title="Add a One-Way SAN (bars inbound traffic)"
        >
          + One-Way
        </button>
        <button
          onClick={() => dispatch({ type: 'ADD_SAN', payload: { sanType: 'vanishing-san' } })}
          className="text-[10px] border border-[#f59e0b] text-[#f59e0b] px-2 py-0.5 hover:bg-[#f59e0b]/10 font-mono uppercase tracking-wider"
          title="Add a Vanishing SAN (timed/teleporting/triggered)"
        >
          + Vanishing
        </button>
        <button
          onClick={() => dispatch({ type: 'ADD_SAN', payload: { sanType: 'ltg' } })}
          className="text-[10px] border border-[#14b8a6] text-[#14b8a6] px-2 py-0.5 hover:bg-[#14b8a6]/10 font-mono uppercase tracking-wider"
          title="Add an LTG (Local Telecommunications Grid)"
        >
          + LTG
        </button>
        <button
          onClick={() => dispatch({ type: 'ADD_SAN', payload: { sanType: 'pltg' } })}
          className="text-[10px] border border-[#6366f1] text-[#6366f1] px-2 py-0.5 hover:bg-[#6366f1]/10 font-mono uppercase tracking-wider"
          title="Add a PLTG (Private LTG — shares security tally)"
        >
          + PLTG
        </button>
        <button
          onClick={() => dispatch({ type: 'ADD_HOST' })}
          className="text-[10px] border border-[var(--color-primary)] text-[var(--color-primary)] px-2 py-0.5 hover:bg-[var(--color-primary)]/10 font-mono uppercase tracking-wider"
        >
          + Host
        </button>
      </div>

      {/* SVG canvas */}
      <div className="flex-1 overflow-auto">
        <svg
          ref={svgRef}
          width={totalW}
          height={totalH}
          className="block"
          style={{ minWidth: '100%', cursor: drag ? 'grabbing' : 'default' }}
          onMouseMove={handleSVGMouseMove}
          onMouseUp={handleSVGMouseUp}
          onMouseLeave={handleSVGMouseUp}
        >
          <defs>
            <pattern id="topo-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(0,255,65,0.04)" strokeWidth="0.5" />
            </pattern>
            <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--color-border)" />
            </marker>
            <marker id="arrow-rtg" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="rgba(100,200,100,0.5)" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#topo-grid)" />

          {/* Connection lines */}
          {runPacket.hosts.map(host => {
            const fromPos = getPos(host.id);
            if (!fromPos) return null;
            return host.nextHostIds.map(toId => {
              const toPos = getPos(toId);
              if (!toPos) return null;
              return (
                <path
                  key={`${host.id}-${toId}`}
                  d={makePath(fromPos, toPos)}
                  fill="none"
                  stroke="var(--color-border)"
                  strokeWidth="1.5"
                  markerEnd="url(#arrow)"
                />
              );
            });
          })}

          {/* RTG → entry lines */}
          {rtgPos && runPacket.entryHostIds.map(eid => {
            const toPos = getPos(eid);
            if (!toPos) return null;
            return (
              <path
                key={`rtg-${eid}`}
                d={makePath(rtgPos, toPos)}
                fill="none"
                stroke={`${SECURITY_CODE_COLORS[runPacket.rtg!.securityCode]}66`}
                strokeWidth="1.5"
                strokeDasharray="4 2"
                markerEnd="url(#arrow-rtg)"
              />
            );
          })}

          {/* RTG node */}
          {rtgPos && runPacket.rtg && (
            <RTGNodeCard rtg={runPacket.rtg} pos={rtgPos} />
          )}

          {/* Host and SAN nodes */}
          {runPacket.hosts.map(host => {
            const pos = getPos(host.id);
            if (!pos) return null;
            const dragHandleProps: React.SVGAttributes<SVGRectElement> = {
              onMouseDown: (e) => startDrag(host.id, e as unknown as React.MouseEvent),
              style: { cursor: drag?.id === host.id ? 'grabbing' : 'grab' },
            };

            if (isSAN(host)) {
              return (
                <SANNode
                  key={host.id}
                  host={host}
                  pos={pos}
                  isSelected={state.selectedHostId === host.id}
                  isEntry={runPacket.entryHostIds.includes(host.id)}
                  onClick={() => handleNodeClick(host.id)}
                  dragHandleProps={dragHandleProps}
                />
              );
            }

            return (
              <HostNodeCard
                key={host.id}
                host={host}
                pos={pos}
                isSelected={state.selectedHostId === host.id}
                isEntry={runPacket.entryHostIds.includes(host.id)}
                onClick={() => handleNodeClick(host.id)}
                dragHandleProps={dragHandleProps}
              />
            );
          })}

          {runPacket.hosts.length === 0 && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-muted-foreground)"
              fontFamily="Courier New"
              fontSize="11"
            >
              No nodes — click + Host, + SAN, or + One-Way to add
            </text>
          )}
        </svg>
      </div>
    </div>
  );
}
