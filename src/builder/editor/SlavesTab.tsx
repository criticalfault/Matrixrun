import { useState } from 'react';
import { useBuilder } from '@/builder/builderContext';
import type { HostSlave, SlaveType } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BASIC_SLAVE_TEMPLATES: Omit<HostSlave, 'id'>[] = [
  {
    name: '1st Floor Cameras',
    type: 'SecurityCamera',
    description: 'Network of security cameras covering the first floor corridors and entry points.',
    controlEffect: 'Decker can review live feeds, loop recorded footage, or create blind spots in coverage. Security guards lose visual on affected zones.',
    isEncrypted: false,
    hasBomb: false,
  },
  {
    name: 'Front Door Maglock',
    type: 'DoorLock',
    description: 'Magnetic lock on the main entrance. Rated for standard corporate access control.',
    controlEffect: 'Decker can lock or unlock the front entrance remotely. Can seal the door to trap personnel or open it for the team.',
    isEncrypted: false,
    hasBomb: false,
  },
  {
    name: 'Back Door Maglock',
    type: 'DoorLock',
    description: 'Magnetic lock on the rear service entrance.',
    controlEffect: 'Decker can lock or unlock the rear exit. Useful for extraction routes or cutting off security response.',
    isEncrypted: false,
    hasBomb: false,
  },
  {
    name: '1st Floor HVAC',
    type: 'EnvironmentalControl',
    description: 'Heating, ventilation, and air conditioning system for the first floor.',
    controlEffect: 'Decker can adjust temperature, redirect airflow, shut down ventilation entirely, or (if chemical stores are connected) pump agents through the ducts. Disabling HVAC in a firefight can affect visibility.',
    isEncrypted: false,
    hasBomb: false,
  },
  {
    name: '1st Floor Fire Alarm',
    type: 'Alarm',
    description: 'Automated fire detection and alarm system for the first floor.',
    controlEffect: 'Decker can trigger a false alarm to evacuate personnel, or suppress the alarm to prevent evacuation during an actual fire or smoke grenade deployment.',
    isEncrypted: false,
    hasBomb: false,
  },
  {
    name: '1st Floor PA / Intercom',
    type: 'Communications',
    description: 'Public address and intercom system covering the first floor.',
    controlEffect: 'Decker can broadcast messages, issue fake security instructions, or cut communications between security checkpoints on the floor.',
    isEncrypted: false,
    hasBomb: false,
  },
  {
    name: '1st Floor Phone System',
    type: 'Communications',
    description: 'Internal telephone and commlink routing for first floor offices.',
    controlEffect: 'Decker can intercept calls, redirect extensions, or cut outbound communications — preventing personnel from calling for outside help.',
    isEncrypted: false,
    hasBomb: false,
  },
];

const SLAVE_TYPES: { value: SlaveType; label: string; icon: string }[] = [
  { value: 'SecurityCamera',       label: 'Security Camera',        icon: '📷' },
  { value: 'DoorLock',             label: 'Door Lock / Maglocks',   icon: '🔒' },
  { value: 'Turret',               label: 'Automated Turret',       icon: '🔫' },
  { value: 'Alarm',                label: 'Alarm System',           icon: '🚨' },
  { value: 'EnvironmentalControl', label: 'Environmental Control',  icon: '🌡' },
  { value: 'VehicleControl',       label: 'Vehicle / Drone',        icon: '🚗' },
  { value: 'PowerSystem',          label: 'Power System',           icon: '⚡' },
  { value: 'Communications',       label: 'Communications',         icon: '📡' },
  { value: 'Custom',               label: 'Custom Device',          icon: '⚙' },
];

function newSlave(): HostSlave {
  return {
    id: crypto.randomUUID(),
    name: 'New Slave Device',
    type: 'SecurityCamera',
    description: '',
    controlEffect: '',
    isEncrypted: false,
    hasBomb: false,
  };
}

function SlaveRow({ slave, hostId }: { slave: HostSlave; hostId: string }) {
  const { dispatch } = useBuilder();
  const [expanded, setExpanded] = useState(false);

  function update(patch: Partial<HostSlave>) {
    dispatch({ type: 'UPDATE_SLAVE', payload: { hostId, slave: { ...slave, ...patch } } });
  }

  const typeDef = SLAVE_TYPES.find(t => t.value === slave.type);

  return (
    <div className="border border-[var(--color-border)] mb-2 font-mono text-[11px]">
      <div
        className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-[var(--color-secondary)]"
        onClick={() => setExpanded(v => !v)}
      >
        <span className="text-[10px] opacity-30">{expanded ? '▾' : '▸'}</span>
        <span className="text-sm">{typeDef?.icon}</span>
        <span className="flex-1 truncate text-[var(--color-foreground)]">{slave.name}</span>
        {slave.isEncrypted && <span className="text-[9px] text-[var(--color-accent)]">ENC</span>}
        {slave.hasBomb && <span className="text-[9px] text-[var(--color-alert-active)]">BOMB</span>}
        <button
          onClick={e => { e.stopPropagation(); dispatch({ type: 'DELETE_SLAVE', payload: { hostId, slaveId: slave.id } }); }}
          className="text-[var(--color-alert-active)] opacity-40 hover:opacity-100 text-[10px]"
        >
          ✕
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[var(--color-border)] p-2 grid grid-cols-2 gap-x-3 gap-y-2 bg-[var(--color-background)]">
          <div>
            <label className="text-[9px] uppercase tracking-wider opacity-50">Device Name</label>
            <Input value={slave.name} onChange={e => update({ name: e.target.value })} className="mt-0.5" />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider opacity-50">Type</label>
            <select
              value={slave.type}
              onChange={e => update({ type: e.target.value as SlaveType })}
              className="mt-0.5 w-full bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-mono focus:outline-none focus:border-[var(--color-primary)] text-[var(--color-foreground)]"
            >
              {SLAVE_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[9px] uppercase tracking-wider opacity-50">Description (shown to decker on Locate Slave)</label>
            <textarea
              value={slave.description}
              onChange={e => update({ description: e.target.value })}
              rows={2}
              className="mt-0.5 w-full bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
              placeholder="e.g. Security camera covering east corridor, level 3..."
            />
          </div>
          <div className="col-span-2">
            <label className="text-[9px] uppercase tracking-wider opacity-50">Effect when Controlled (shown after successful Control Slave)</label>
            <textarea
              value={slave.controlEffect}
              onChange={e => update({ controlEffect: e.target.value })}
              rows={2}
              className="mt-0.5 w-full bg-[var(--color-input)] border border-[var(--color-border)] px-2 py-1 text-[11px] font-mono text-[var(--color-foreground)] focus:outline-none focus:border-[var(--color-primary)] resize-none"
              placeholder="e.g. Camera feed redirected to decker. Blind spot created on east side..."
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`enc-${slave.id}`}
              checked={slave.isEncrypted}
              onChange={e => update({ isEncrypted: e.target.checked })}
              className="accent-[var(--color-primary)]"
            />
            <label htmlFor={`enc-${slave.id}`} className="text-[10px] opacity-70 cursor-pointer">Encrypted</label>
            {slave.isEncrypted && (
              <Input
                type="number" min={1}
                value={slave.encryptionRating ?? ''}
                onChange={e => update({ encryptionRating: parseInt(e.target.value) || undefined })}
                placeholder="Rating"
                className="w-20"
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`bomb-${slave.id}`}
              checked={slave.hasBomb}
              onChange={e => update({ hasBomb: e.target.checked })}
              className="accent-[var(--color-primary)]"
            />
            <label htmlFor={`bomb-${slave.id}`} className="text-[10px] opacity-70 cursor-pointer">Data Bomb</label>
            {slave.hasBomb && (
              <Input
                type="number" min={1}
                value={slave.bombRating ?? ''}
                onChange={e => update({ bombRating: parseInt(e.target.value) || undefined })}
                placeholder="Rating"
                className="w-20"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SlavesTab() {
  const { selectedHost, dispatch } = useBuilder();
  const [justBuilt, setJustBuilt] = useState(false);
  if (!selectedHost) return null;
  const h = selectedHost;

  function buildBasicSlaves() {
    BASIC_SLAVE_TEMPLATES.forEach(template => {
      dispatch({
        type: 'ADD_SLAVE',
        payload: { hostId: h.id, slave: { ...template, id: crypto.randomUUID() } },
      });
    });
    setJustBuilt(true);
    setTimeout(() => setJustBuilt(false), 1200);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-3 py-2 border-b border-[var(--color-border)]">
        <span className="text-[9px] uppercase tracking-widest text-[var(--color-muted-foreground)]">
          Slaved Devices — {h.slaves.length} defined
        </span>
        <div className="flex-1" />
        <button
          onClick={buildBasicSlaves}
          className="text-[10px] border px-2 py-0.5 font-mono uppercase tracking-wider transition-all"
          style={{
            borderColor: justBuilt ? 'var(--color-primary)' : 'var(--color-border)',
            color: justBuilt ? 'var(--color-primary)' : 'var(--color-muted-foreground)',
            backgroundColor: justBuilt ? 'var(--color-primary)15' : 'transparent',
          }}
          title="Add a standard set of 1st floor slave devices"
        >
          {justBuilt ? '✓ Added' : '⚙ Basic Slaves'}
        </button>
        <Button size="sm" variant="outline" onClick={() => dispatch({ type: 'ADD_SLAVE', payload: { hostId: h.id, slave: newSlave() } })}>
          + Slave
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {h.slaves.length === 0 ? (
          <div className="text-[10px] text-[var(--color-muted-foreground)] text-center py-8 font-mono">
            No slaved devices. Add cameras, door locks, turrets, etc.
            <br />
            Deckers use Locate Slave → Control Slave to interact.
          </div>
        ) : (
          h.slaves.map(s => <SlaveRow key={s.id} slave={s} hostId={h.id} />)
        )}
      </div>
    </div>
  );
}
