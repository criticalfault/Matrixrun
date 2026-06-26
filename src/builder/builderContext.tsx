import { createContext, useContext, useReducer, type ReactNode } from 'react';
import type {
  RunPacketWithGMData, Host, RTGEntry, TriggerStep, ICInstance,
  HostFile, HostSlave, PaydataPoint, SecurityCode, SubsystemRatings,
  TopologyNodeType,
} from '@/types';
import { createEmptyRunPacket, saveBuilderDraft } from '@/engine/runPacketCodec';
import { SECURITY_CODE_MAX_VALUE } from '@/data/srTables';

// ─── State ────────────────────────────────────────────────────────────────────

export interface BuilderState {
  runPacket: RunPacketWithGMData;
  selectedHostId: string | null;
  isDirty: boolean;
}

// ─── Actions ──────────────────────────────────────────────────────────────────

export type BuilderAction =
  | { type: 'SET_RUN_PACKET'; payload: RunPacketWithGMData }
  | { type: 'SET_RUN_NAME'; payload: string }
  | { type: 'SET_RUN_DESCRIPTION'; payload: string }
  | { type: 'SET_GM_NOTES'; payload: string }
  | { type: 'SET_RTG'; payload: RTGEntry | null }
  | { type: 'ADD_HOST' }
  | { type: 'ADD_SAN'; payload: { sanType: TopologyNodeType } }
  | { type: 'ADD_LTG'; payload: { isPLTG: boolean } }
  | { type: 'DELETE_HOST'; payload: string }
  | { type: 'SELECT_HOST'; payload: string | null }
  | { type: 'UPDATE_HOST'; payload: Partial<Host> & { id: string } }
  | { type: 'MOVE_NODE'; payload: { id: string; x: number; y: number } }
  | { type: 'ADD_CONNECTION'; payload: { fromId: string; toId: string } }
  | { type: 'REMOVE_CONNECTION'; payload: { fromId: string; toId: string } }
  | { type: 'SET_ENTRY_HOST'; payload: string }
  | { type: 'ADD_TRIGGER_STEP'; payload: { hostId: string; step: TriggerStep } }
  | { type: 'UPDATE_TRIGGER_STEP'; payload: { hostId: string; step: TriggerStep } }
  | { type: 'DELETE_TRIGGER_STEP'; payload: { hostId: string; stepId: string } }
  | { type: 'ADD_IC'; payload: { hostId: string; stepId: string; ic: ICInstance } }
  | { type: 'DELETE_IC'; payload: { hostId: string; stepId: string; icId: string } }
  | { type: 'ADD_FILE'; payload: { hostId: string; file: HostFile } }
  | { type: 'UPDATE_FILE'; payload: { hostId: string; file: HostFile } }
  | { type: 'DELETE_FILE'; payload: { hostId: string; fileId: string } }
  | { type: 'ADD_SLAVE'; payload: { hostId: string; slave: HostSlave } }
  | { type: 'UPDATE_SLAVE'; payload: { hostId: string; slave: HostSlave } }
  | { type: 'DELETE_SLAVE'; payload: { hostId: string; slaveId: string } }
  | { type: 'ADD_PAYDATA'; payload: { hostId: string; pd: PaydataPoint } }
  | { type: 'DELETE_PAYDATA'; payload: { hostId: string; pdId: string } }
  | { type: 'MARK_SAVED' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newHost(): Host {
  return {
    id: crypto.randomUUID(),
    name: 'New Host',
    description: '',
    metaphor: '',
    securityCode: 'Green',
    securityValue: 4,
    subsystems: { access: 6, files: 6, slave: 6, index: 6, control: 6 },
    subsystemVariants: [],
    securitySheaf: [],
    paydata: [],
    files: [],
    slaves: [],
    nextHostIds: [],
    nodeType: 'host',
    specialFeatures: {},
  };
}

function newSAN(sanType: TopologyNodeType): Host {
  const nameMap: Partial<Record<TopologyNodeType, string>> = {
    'san': 'SAN',
    'one-way-san': 'One-Way SAN',
    'vanishing-san': 'Vanishing SAN',
    'ltg': 'LTG',
    'pltg': 'PLTG',
  };
  return {
    id: crypto.randomUUID(),
    name: nameMap[sanType] ?? 'SAN',
    description: '',
    metaphor: '',
    securityCode: 'Blue',
    securityValue: 0,
    subsystems: { access: 0, files: 0, slave: 0, index: 0, control: 0 },
    subsystemVariants: [],
    securitySheaf: [],
    paydata: [],
    files: [],
    slaves: [],
    nextHostIds: [],
    nodeType: sanType,
    specialFeatures: {},
  };
}

function updateHost(hosts: Host[], id: string, patch: Partial<Host>): Host[] {
  return hosts.map(h => h.id === id ? { ...h, ...patch } : h);
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: BuilderState, action: BuilderAction): BuilderState {
  const rp = state.runPacket;

  switch (action.type) {
    case 'SET_RUN_PACKET':
      return { ...state, runPacket: action.payload, isDirty: false };

    case 'SET_RUN_NAME':
      return { ...state, runPacket: { ...rp, name: action.payload }, isDirty: true };

    case 'SET_RUN_DESCRIPTION':
      return { ...state, runPacket: { ...rp, description: action.payload }, isDirty: true };

    case 'SET_GM_NOTES':
      return { ...state, runPacket: { ...rp, gmNotes: action.payload }, isDirty: true };

    case 'SET_RTG':
      return {
        ...state,
        runPacket: { ...rp, rtg: action.payload ?? undefined },
        isDirty: true,
      };

    case 'ADD_HOST': {
      const host = newHost();
      const isFirst = rp.hosts.length === 0;
      return {
        ...state,
        runPacket: {
          ...rp,
          hosts: [...rp.hosts, host],
          entryHostIds: isFirst ? [host.id] : rp.entryHostIds,
        },
        selectedHostId: host.id,
        isDirty: true,
      };
    }

    case 'ADD_SAN': {
      const san = newSAN(action.payload.sanType);
      return {
        ...state,
        runPacket: { ...rp, hosts: [...rp.hosts, san] },
        selectedHostId: san.id,
        isDirty: true,
      };
    }

    case 'ADD_LTG': {
      const ltg = newSAN(action.payload.isPLTG ? 'pltg' : 'ltg');
      return {
        ...state,
        runPacket: { ...rp, hosts: [...rp.hosts, ltg] },
        selectedHostId: ltg.id,
        isDirty: true,
      };
    }

    case 'MOVE_NODE': {
      const { id, x, y } = action.payload;
      return {
        ...state,
        runPacket: {
          ...rp,
          hosts: rp.hosts.map(h => h.id === id ? { ...h, position: { x, y } } : h),
        },
        isDirty: true,
      };
    }

    case 'DELETE_HOST': {
      const id = action.payload;
      const hosts = rp.hosts
        .filter(h => h.id !== id)
        .map(h => ({ ...h, nextHostIds: h.nextHostIds.filter(nid => nid !== id) }));
      return {
        ...state,
        runPacket: {
          ...rp,
          hosts,
          entryHostIds: rp.entryHostIds.filter(eid => eid !== id),
        },
        selectedHostId: state.selectedHostId === id ? null : state.selectedHostId,
        isDirty: true,
      };
    }

    case 'SELECT_HOST':
      return { ...state, selectedHostId: action.payload };

    case 'UPDATE_HOST':
      return {
        ...state,
        runPacket: { ...rp, hosts: updateHost(rp.hosts, action.payload.id, action.payload) },
        isDirty: true,
      };

    case 'ADD_CONNECTION': {
      const { fromId, toId } = action.payload;
      const hosts = rp.hosts.map(h =>
        h.id === fromId && !h.nextHostIds.includes(toId)
          ? { ...h, nextHostIds: [...h.nextHostIds, toId] }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'REMOVE_CONNECTION': {
      const { fromId, toId } = action.payload;
      const hosts = rp.hosts.map(h =>
        h.id === fromId ? { ...h, nextHostIds: h.nextHostIds.filter(id => id !== toId) } : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'SET_ENTRY_HOST': {
      const id = action.payload;
      const entryHostIds = rp.entryHostIds.includes(id)
        ? rp.entryHostIds.filter(eid => eid !== id)
        : [...rp.entryHostIds, id];
      return { ...state, runPacket: { ...rp, entryHostIds }, isDirty: true };
    }

    case 'ADD_TRIGGER_STEP': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, securitySheaf: [...h.securitySheaf, action.payload.step].sort((a, b) => a.triggerValue - b.triggerValue) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'UPDATE_TRIGGER_STEP': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? {
              ...h,
              securitySheaf: h.securitySheaf
                .map(s => s.id === action.payload.step.id ? action.payload.step : s)
                .sort((a, b) => a.triggerValue - b.triggerValue),
            }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'DELETE_TRIGGER_STEP': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, securitySheaf: h.securitySheaf.filter(s => s.id !== action.payload.stepId) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'ADD_IC': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? {
              ...h,
              securitySheaf: h.securitySheaf.map(s =>
                s.id === action.payload.stepId
                  ? { ...s, ic: [...s.ic, action.payload.ic] }
                  : s,
              ),
            }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'DELETE_IC': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? {
              ...h,
              securitySheaf: h.securitySheaf.map(s =>
                s.id === action.payload.stepId
                  ? { ...s, ic: s.ic.filter(ic => ic.id !== action.payload.icId) }
                  : s,
              ),
            }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'ADD_FILE': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId ? { ...h, files: [...h.files, action.payload.file] } : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'UPDATE_FILE': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, files: h.files.map(f => f.id === action.payload.file.id ? action.payload.file : f) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'DELETE_FILE': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, files: h.files.filter(f => f.id !== action.payload.fileId) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'ADD_SLAVE': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId ? { ...h, slaves: [...h.slaves, action.payload.slave] } : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'UPDATE_SLAVE': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, slaves: h.slaves.map(s => s.id === action.payload.slave.id ? action.payload.slave : s) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'DELETE_SLAVE': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, slaves: h.slaves.filter(s => s.id !== action.payload.slaveId) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'ADD_PAYDATA': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId ? { ...h, paydata: [...h.paydata, action.payload.pd] } : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'DELETE_PAYDATA': {
      const hosts = rp.hosts.map(h =>
        h.id === action.payload.hostId
          ? { ...h, paydata: h.paydata.filter(p => p.id !== action.payload.pdId) }
          : h,
      );
      return { ...state, runPacket: { ...rp, hosts }, isDirty: true };
    }

    case 'MARK_SAVED':
      return { ...state, isDirty: false };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface BuilderContextValue {
  state: BuilderState;
  dispatch: React.Dispatch<BuilderAction>;
  selectedHost: Host | undefined;
  save: () => void;
}

const BuilderContext = createContext<BuilderContextValue | null>(null);

export function BuilderProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    runPacket: createEmptyRunPacket(),
    selectedHostId: null,
    isDirty: false,
  });

  const selectedHost = state.runPacket.hosts.find(h => h.id === state.selectedHostId);

  function save() {
    saveBuilderDraft(state.runPacket);
    dispatch({ type: 'MARK_SAVED' });
  }

  return (
    <BuilderContext.Provider value={{ state, dispatch, selectedHost, save }}>
      {children}
    </BuilderContext.Provider>
  );
}

export function useBuilder() {
  const ctx = useContext(BuilderContext);
  if (!ctx) throw new Error('useBuilder must be used within BuilderProvider');
  return ctx;
}

// ─── Derived helpers ──────────────────────────────────────────────────────────

export function defaultSubsystems(code: SecurityCode): SubsystemRatings {
  const base = SECURITY_CODE_MAX_VALUE[code];
  return { access: base, files: base, slave: base - 1, index: base - 1, control: base };
}
