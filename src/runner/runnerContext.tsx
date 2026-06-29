import { createContext, useContext, useReducer, useCallback, type ReactNode } from 'react';
import type {
  RunPacket, CharacterSheet, RunnerSession, AlertLevel,
  ICInstance, LogEntry, LogEntryType, PersonaCondition, Host, ICType,
  HostKnowledge, SubsystemRatings,
} from '@/types';

// ─── Actions ──────────────────────────────────────────────────────────────────

export type RunnerAction =
  | { type: 'LOGIN';            payload: { runPacket: RunPacket; character: CharacterSheet } }
  | { type: 'LOG';              payload: LogEntry }
  | { type: 'ADD_TALLY';        payload: number }
  | { type: 'SET_ALERT';        payload: AlertLevel }
  | { type: 'SPEND_POOL';       payload: number }
  | { type: 'END_COMBAT_TURN' }
  | { type: 'ADVANCE_HOST';     payload: string }   // next host id
  | { type: 'ACTIVATE_IC';      payload: ICInstance }
  | { type: 'REMOVE_IC';        payload: string }   // ic id
  | { type: 'DAMAGE_PERSONA';      payload: Partial<PersonaCondition> }
  | { type: 'TAKE_PERSONA_DAMAGE'; payload: number }   // boxes on icon condition monitor
  | { type: 'TAKE_STUN';          payload: number }
  | { type: 'TAKE_PHYS';          payload: number }
  | { type: 'FIND_PAYDATA';     payload: string }   // file id
  | { type: 'SET_INITIATIVE';   payload: number }
  | { type: 'SET_SHUTDOWN';     payload: number | undefined }
  | { type: 'TICK_SHUTDOWN' }
  | { type: 'CRASH_IC';         payload: { icId: string; suppress: boolean } }
  | { type: 'UPDATE_IC_RATING'; payload: { icId: string; newRating: number } }
  | { type: 'SET_SUPPRESSION_POOL'; payload: number }
  | { type: 'SET_SAFEJACK' }
  | { type: 'GO_BACK' }
  | { type: 'DISCOVER_NEXT_HOSTS'; payload: { hostId: string; nextIds: string[] } }
  | { type: 'LOCATE_FILES';  payload: { hostId: string; fileIds:  string[] } }
  | { type: 'LOCATE_SLAVES'; payload: { hostId: string; slaveIds: string[] } }
  | { type: 'EVADE_IC';      payload: { icId: string; turns: number } }
  | { type: 'TICK_EVASION' }
  | { type: 'REVEAL_HOST_INFO';    payload: {
      hostId: string;
      securityRating?: boolean;
      subsystems?: Partial<Record<keyof SubsystemRatings, boolean>>;
    } };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcHackingPool(char: CharacterSheet): number {
  return char.hackingPool;
}

function initialPersona(): PersonaCondition {
  return { bod: 0, evasion: 0, sensors: 0, masking: 0 };
}

function blankKnowledge(): HostKnowledge {
  return {
    securityRating: false,
    subsystems: { access: false, files: false, slave: false, index: false, control: false },
  };
}

function buildKnownHosts(hosts: RunPacket['hosts']): Record<string, HostKnowledge> {
  return Object.fromEntries(hosts.map(h => [h.id, blankKnowledge()]));
}

export function currentHost(session: RunnerSession): Host | undefined {
  return session.runPacket?.hosts?.find(h => h.id === session.currentHostId);
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(state: RunnerSession, action: RunnerAction): RunnerSession {
  switch (action.type) {

    case 'LOGIN': {
      const { runPacket, character } = action.payload;
      const entryId = runPacket.entryHostIds[0] ?? runPacket.hosts[0]?.id ?? '';
      return {
        runPacket,
        character,
        currentHostId: entryId,
        securityTally: 0,
        alertLevel: 'none',
        activeIC: [],
        suppressedIC: [],
        personaBoxes: 0,
        personaCondition: initialPersona(),
        stunDamage: 0,
        physDamage: 0,
        loadedPrograms: character.programs ?? [],
        hackingPoolTotal: calcHackingPool(character),
        hackingPoolUsed: 0,
        suppressionPool: 0,
        combatTurn: 1,
        combatPass: 1,
        initiative: 0,
        foundPaydata: [],
        log: [],
        isLoggedIn: true,
        safejack: false,
        hostHistory: [entryId],
        knownNextHosts: {},
        locatedFiles: {},
        locatedSlaves: {},
        evadingIC: {},
        shutdownCountdown: undefined,
        knownHosts: buildKnownHosts(runPacket.hosts),
      };
    }

    case 'LOG':
      return { ...state, log: [...state.log, action.payload] };

    case 'ADD_TALLY': {
      const tally = state.securityTally + action.payload;
      return { ...state, securityTally: tally };
    }

    case 'SET_ALERT':
      return { ...state, alertLevel: action.payload };

    case 'SPEND_POOL':
      return { ...state, hackingPoolUsed: state.hackingPoolUsed + action.payload };

    case 'END_COMBAT_TURN': {
      // Decrement evasion timers; expired ones drop out
      const nextEvading: Record<string, number> = {};
      for (const [id, turns] of Object.entries(state.evadingIC ?? {})) {
        if (turns > 1) nextEvading[id] = turns - 1;
      }
      return {
        ...state,
        hackingPoolUsed: 0,
        suppressionPool: 0,
        combatTurn: state.combatTurn + 1,
        combatPass: 1,
        evadingIC: nextEvading,
      };
    }

    case 'SET_SUPPRESSION_POOL':
      return { ...state, suppressionPool: action.payload };

    case 'ADVANCE_HOST': {
      const nextHostId = action.payload;
      const currHost = state.runPacket.hosts.find(h => h.id === state.currentHostId);
      const nextHost = state.runPacket.hosts.find(h => h.id === nextHostId);
      const samePLTG = !!(
        currHost?.pltgGroupId &&
        nextHost?.pltgGroupId &&
        currHost.pltgGroupId === nextHost.pltgGroupId
      );
      // Mark the target as discovered from current host
      const prevKnown = state.knownNextHosts[state.currentHostId] ?? [];
      const updatedKnownNext = prevKnown.includes(nextHostId)
        ? state.knownNextHosts
        : { ...state.knownNextHosts, [state.currentHostId]: [...prevKnown, nextHostId] };
      return {
        ...state,
        currentHostId: nextHostId,
        hostHistory: [...(state.hostHistory ?? []), nextHostId],
        knownNextHosts: updatedKnownNext,
        securityTally: samePLTG ? state.securityTally : 0,
        alertLevel:    samePLTG ? state.alertLevel    : 'none',
        activeIC:      samePLTG ? state.activeIC      : [],
      };
    }

    case 'GO_BACK': {
      const history = state.hostHistory ?? [];
      if (history.length <= 1) return state; // already at entry
      const newHistory = history.slice(0, -1);
      const prevId = newHistory[newHistory.length - 1];
      return {
        ...state,
        currentHostId: prevId,
        hostHistory: newHistory,
        // Reset combat state when backing out
        activeIC: [],
        alertLevel: 'none',
        securityTally: 0,
      };
    }

    case 'DISCOVER_NEXT_HOSTS': {
      const { hostId, nextIds } = action.payload;
      const prev = state.knownNextHosts[hostId] ?? [];
      const merged = [...new Set([...prev, ...nextIds])];
      return {
        ...state,
        knownNextHosts: { ...state.knownNextHosts, [hostId]: merged },
      };
    }

    case 'ACTIVATE_IC':
      return { ...state, activeIC: [...state.activeIC.filter(i => i.id !== action.payload.id), action.payload] };

    case 'REMOVE_IC':
      return { ...state, activeIC: state.activeIC.filter(i => i.id !== action.payload) };

    case 'DAMAGE_PERSONA': {
      const p = state.personaCondition;
      return {
        ...state,
        personaCondition: {
          bod:     Math.max(0, p.bod     + (action.payload.bod     ?? 0)),
          evasion: Math.max(0, p.evasion + (action.payload.evasion ?? 0)),
          sensors: Math.max(0, p.sensors + (action.payload.sensors ?? 0)),
          masking: Math.max(0, p.masking + (action.payload.masking ?? 0)),
        },
      };
    }

    case 'TAKE_PERSONA_DAMAGE':
      return { ...state, personaBoxes: Math.min(10, (state.personaBoxes ?? 0) + action.payload) };

    case 'TAKE_STUN':
      return { ...state, stunDamage: Math.min(10, state.stunDamage + action.payload) };

    case 'TAKE_PHYS':
      return { ...state, physDamage: Math.min(10, state.physDamage + action.payload) };

    case 'FIND_PAYDATA':
      return { ...state, foundPaydata: [...state.foundPaydata, action.payload] };

    case 'SET_INITIATIVE':
      return { ...state, initiative: action.payload };

    case 'SET_SHUTDOWN':
      return { ...state, shutdownCountdown: action.payload };

    case 'TICK_SHUTDOWN':
      return {
        ...state,
        shutdownCountdown: state.shutdownCountdown !== undefined
          ? Math.max(0, state.shutdownCountdown - 1)
          : undefined,
      };

    case 'CRASH_IC': {
      const { icId, suppress } = action.payload;
      const crashed = state.activeIC.find(i => i.id === icId);
      if (!crashed) return state;
      const newActive = state.activeIC.filter(i => i.id !== icId);
      if (suppress) {
        return {
          ...state,
          activeIC: newActive,
          suppressedIC: [
            ...(state.suppressedIC ?? []),
            { id: crashed.id, type: crashed.type as ICType, rating: crashed.rating },
          ],
        };
      } else {
        return {
          ...state,
          activeIC: newActive,
          securityTally: state.securityTally + crashed.rating,
        };
      }
    }

    case 'UPDATE_IC_RATING': {
      return {
        ...state,
        activeIC: state.activeIC.map(ic =>
          ic.id === action.payload.icId
            ? { ...ic, currentRating: action.payload.newRating }
            : ic
        ),
      };
    }

    case 'LOCATE_FILES': {
      const { hostId, fileIds } = action.payload;
      const prev = state.locatedFiles?.[hostId] ?? [];
      const merged = [...new Set([...prev, ...fileIds])];
      return { ...state, locatedFiles: { ...(state.locatedFiles ?? {}), [hostId]: merged } };
    }

    case 'LOCATE_SLAVES': {
      const { hostId, slaveIds } = action.payload;
      const prev = state.locatedSlaves?.[hostId] ?? [];
      const merged = [...new Set([...prev, ...slaveIds])];
      return { ...state, locatedSlaves: { ...(state.locatedSlaves ?? {}), [hostId]: merged } };
    }

    case 'EVADE_IC': {
      const { icId, turns } = action.payload;
      return { ...state, evadingIC: { ...(state.evadingIC ?? {}), [icId]: turns } };
    }

    case 'TICK_EVASION': {
      const next: Record<string, number> = {};
      for (const [id, turns] of Object.entries(state.evadingIC ?? {})) {
        if (turns > 1) next[id] = turns - 1;
        // turns === 1 → expires, not copied → IC re-appears
      }
      return { ...state, evadingIC: next };
    }

    case 'SET_SAFEJACK':
      return { ...state, safejack: true };

    case 'REVEAL_HOST_INFO': {
      const { hostId, securityRating, subsystems } = action.payload;
      const prev = state.knownHosts[hostId] ?? blankKnowledge();
      return {
        ...state,
        knownHosts: {
          ...state.knownHosts,
          [hostId]: {
            securityRating: securityRating ?? prev.securityRating,
            subsystems: { ...prev.subsystems, ...subsystems },
          },
        },
      };
    }

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface RunnerContextValue {
  session: RunnerSession;
  dispatch: React.Dispatch<RunnerAction>;
  hackingPoolAvailable: number;
  host: Host | undefined;
  addLog: (type: LogEntryType, title: string, details?: string, rolls?: LogEntry['rolls']) => void;
  detectionFactorPenalty: number;
}

const RunnerContext = createContext<RunnerContextValue | null>(null);

const EMPTY_SESSION: RunnerSession = {
  runPacket: null as unknown as RunPacket,
  character: null as unknown as CharacterSheet,
  currentHostId: '',
  securityTally: 0,
  alertLevel: 'none',
  activeIC: [],
  suppressedIC: [],
  personaBoxes: 0,
  personaCondition: initialPersona(),
  stunDamage: 0,
  physDamage: 0,
  loadedPrograms: [],
  hackingPoolTotal: 0,
  hackingPoolUsed: 0,
  suppressionPool: 0,
  combatTurn: 1,
  combatPass: 1,
  initiative: 0,
  foundPaydata: [],
  log: [],
  isLoggedIn: false,
  safejack: false,
  hostHistory: [],
  knownNextHosts: {},
  locatedFiles: {},
  locatedSlaves: {},
  evadingIC: {},
  knownHosts: {},
};

export function RunnerProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(reducer, EMPTY_SESSION);

  const hackingPoolAvailable = session.hackingPoolTotal - session.hackingPoolUsed - session.suppressionPool;
  const host = currentHost(session);
  const detectionFactorPenalty = (session.suppressedIC ?? []).length;

  const addLog = useCallback((type: LogEntryType, title: string, details = '', rolls?: LogEntry['rolls']) => {
    dispatch({
      type: 'LOG',
      payload: {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type,
        title,
        details,
        rolls,
      },
    });
  }, []);

  return (
    <RunnerContext.Provider value={{ session, dispatch, hackingPoolAvailable, host, addLog, detectionFactorPenalty }}>
      {children}
    </RunnerContext.Provider>
  );
}

export function useRunner() {
  const ctx = useContext(RunnerContext);
  if (!ctx) throw new Error('useRunner must be used within RunnerProvider');
  return ctx;
}
