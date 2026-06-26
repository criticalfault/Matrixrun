import type { RunnerSession, ICInstance, AlertLevel, Host, TriggerStep } from '@/types';
import { ALERT_SUBSYSTEM_MODIFIER } from '@/data/srTables';

// ─── Security Tally ───────────────────────────────────────────────────────────

export function addToTally(session: RunnerSession, amount: number): RunnerSession {
  if (amount === 0) return session;
  const newTally = session.securityTally + amount;
  const updated = { ...session, securityTally: newTally };
  return checkTriggerSteps(updated, session.securityTally);
}

/**
 * Check if any new trigger steps have been crossed since the last tally.
 * Activates IC and/or alert changes for each crossed step.
 */
export function checkTriggerSteps(
  session: RunnerSession,
  previousTally: number,
): RunnerSession {
  const host = getCurrentHost(session);
  if (!host) return session;

  let updated = { ...session };

  const crossedSteps = host.securitySheaf.filter(
    step => step.triggerValue > previousTally && step.triggerValue <= updated.securityTally,
  );

  for (const step of crossedSteps) {
    updated = activateTriggerStep(updated, step);
  }

  return updated;
}

function activateTriggerStep(session: RunnerSession, step: TriggerStep): RunnerSession {
  let updated = { ...session };

  // Apply alert change if specified
  if (step.alertChange) {
    updated = applyAlertChange(updated, step.alertChange);
  }

  // Spawn fresh copies of each IC in the step (ICStatus = active)
  const newIC: ICInstance[] = step.ic.map(ic => ({
    ...ic,
    status: 'active' as const,
    currentRating: ic.rating,
  }));

  if (newIC.length > 0) {
    updated = {
      ...updated,
      activeIC: [...updated.activeIC, ...newIC],
      log: [
        ...updated.log,
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: 'ic-activation',
          title: `Trigger step ${step.triggerValue} crossed`,
          details: newIC.map(ic => `${ic.type}-${ic.rating} activated`).join(', '),
          newTally: updated.securityTally,
        },
      ],
    };
  }

  return updated;
}

function applyAlertChange(
  session: RunnerSession,
  change: 'passive' | 'active' | 'shutdown',
): RunnerSession {
  const alertOrder: AlertLevel[] = ['none', 'passive', 'active', 'shutdown'];
  const current = alertOrder.indexOf(session.alertLevel);
  const next = alertOrder.indexOf(change);

  // Alerts only escalate, never de-escalate mid-run
  if (next <= current) return session;

  return {
    ...session,
    alertLevel: change,
    log: [
      ...session.log,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'alert',
        title: `${change.charAt(0).toUpperCase() + change.slice(1)} Alert`,
        details: getAlertDescription(change),
      },
    ],
  };
}

function getAlertDescription(level: 'passive' | 'active' | 'shutdown'): string {
  switch (level) {
    case 'passive':
      return 'Passive alert triggered. All subsystem ratings increase by 2. Security deckers may investigate.';
    case 'active':
      return 'Active alert triggered. Security deckers are actively hunting the intruder. IC is aggressive.';
    case 'shutdown':
      return 'Host shutdown initiated. The system is beginning its shutdown sequence.';
  }
}

// ─── Subsystem Rating Resolution ─────────────────────────────────────────────

export type SubsystemKey = 'access' | 'files' | 'slave' | 'index' | 'control';

/**
 * Get the effective rating of a subsystem, accounting for:
 * - Alert level modifiers (+2 during passive/active)
 * - Per-file-area overrides (SubsystemVariants)
 */
export function getEffectiveSubsystemRating(
  host: Host,
  subsystem: SubsystemKey,
  alertLevel: AlertLevel,
  variantDescription?: string,
): number {
  let base = host.subsystems[subsystem];

  // Apply alert modifier
  base += ALERT_SUBSYSTEM_MODIFIER[alertLevel];

  // Apply variant override if specified
  if (variantDescription) {
    const variant = host.subsystemVariants.find(
      v => v.subsystem === subsystem && v.description === variantDescription,
    );
    if (variant) base += variant.modifier;
  }

  return Math.max(1, base);
}

// ─── Host Shutdown ────────────────────────────────────────────────────────────

/**
 * Initiate the shutdown countdown.
 * Shutdown turns = sum of (SecurityValue ÷ 2, rounded up) d6.
 */
export function initiateShutdown(session: RunnerSession): RunnerSession {
  const host = getCurrentHost(session);
  if (!host) return session;

  const diceCount = Math.ceil(host.securityValue / 2);
  let total = 0;
  for (let i = 0; i < diceCount; i++) {
    total += Math.floor(Math.random() * 6) + 1;
  }

  return {
    ...session,
    shutdownCountdown: total,
    alertLevel: 'shutdown',
    log: [
      ...session.log,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'system',
        title: 'HOST SHUTDOWN INITIATED',
        details: `Shutdown sequence started. ${total} combat turns remaining before host goes offline.`,
      },
    ],
  };
}

export function tickShutdownCountdown(session: RunnerSession): RunnerSession {
  if (session.shutdownCountdown === undefined || session.shutdownCountdown <= 0) return session;
  return { ...session, shutdownCountdown: session.shutdownCountdown - 1 };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getCurrentHost(session: RunnerSession): Host | undefined {
  return session.runPacket.hosts.find(h => h.id === session.currentHostId);
}

export function getNextHostId(session: RunnerSession): string | undefined {
  const host = getCurrentHost(session);
  return host?.nextHostIds[0];
}

export function hasMoreHosts(session: RunnerSession): boolean {
  const host = getCurrentHost(session);
  return (host?.nextHostIds.length ?? 0) > 0;
}

export function advanceToNextHost(session: RunnerSession): RunnerSession {
  const nextId = getNextHostId(session);
  if (!nextId) return session;
  const currentHost = getCurrentHost(session);
  const nextHost = session.runPacket.hosts.find(h => h.id === nextId);

  const samePLTG = !!(
    currentHost?.pltgGroupId &&
    nextHost?.pltgGroupId &&
    currentHost.pltgGroupId === nextHost.pltgGroupId
  );

  return {
    ...session,
    currentHostId: nextId,
    securityTally: samePLTG ? session.securityTally : 0,
    alertLevel: samePLTG ? session.alertLevel : 'none',
    activeIC: samePLTG ? session.activeIC : [],
    hackingPoolUsed: 0,
    isLoggedIn: false,
    shutdownCountdown: undefined,
    log: [
      ...session.log,
      {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        type: 'navigation',
        title: 'Moving to next host',
        details: samePLTG
          ? `Entering: ${nextHost?.name ?? nextId} (PLTG — tally carries over)`
          : `Entering: ${nextHost?.name ?? nextId}`,
      },
    ],
  };
}
