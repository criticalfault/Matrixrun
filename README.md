# MatrixRun

A Shadowrun 3rd Edition Matrix GM tool for running decking encounters. Supports two modes: **Builder** (GM) for constructing host networks and **Runner** (Decker) for live play sessions.

Rules implement SR3 core + Matrix3 sourcebook combined ruleset (Matrix3 overwrites SR3 where they conflict).

## Features

### Builder Mode (GM)
- **Topology Canvas** — drag-and-drop DAG editor for host networks with full node type support:
  - Hosts (Blue / Green / Orange / Red / UV security codes)
  - Standard SANs, One-Way SANs (+1D6 Access penalty), Vanishing SANs (Timed / Teleporting / Triggered)
  - LTG and PLTG nodes with PLTG security tally carryover
- **Security Sheaf** — per-host IC and trigger step configuration
  - Trigger steps generated using the SR3 cumulative 1D6-2+modifier formula
  - Killer IC damage codes auto-set by security code (Blue/Green=M, Orange/Red=S, UV=D)
  - Worm sub-types: Crashworm, Deathworm, Dataworm, Tapeworm, Ringworm
- **Intrusion Difficulty** — Easy / Average / Hard presets roll SR3 dice formulas for Security Values and Subsystem Ratings
- **Files & Slaves** — paydata, data files, and slaved device management
- **Randomizer** — full host randomization with 30+ SR3-themed paydata name pools per security code

### Runner Mode (Decker)
- Live session tracking: security tally, alert level, active IC
- PLTG tally carryover between linked hosts
- Suppressed IC tracking (no tally increase, -1 Detection Factor per suppressed IC)

## Tech Stack

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) build tool
- [shadcn/ui](https://ui.shadcn.com/) component library
- [Tailwind CSS](https://tailwindcss.com/)

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## Rules Reference

This tool implements rules from:
- *Shadowrun, Third Edition* (FASA, 1998) — core Matrix chapter
- *Matrix* sourcebook (FASA, 1999) — expands IC types, alert table, SAN variants, UV hosts

SR3 core rules are used as the base. Matrix sourcebook rules overwrite SR3 where they conflict. This means UV hosts and the Shutdown alert level are in scope.

## License

Fan project. Shadowrun is a registered trademark of The Topps Company, Inc. This tool is unofficial and not affiliated with or endorsed by Topps, Catalyst Game Labs, or any rights holder.
