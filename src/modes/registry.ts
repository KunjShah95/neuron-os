import type { Mode } from "./types"

const modes = new Map<string, Mode>()

export function registerMode(mode: Mode) {
  modes.set(mode.id, mode)
}

export function getMode(id: string): Mode | undefined {
  return modes.get(id)
}

export function listModes(): Mode[] {
  return Array.from(modes.values())
}

export function getModeNames(): string[] {
  return Array.from(modes.keys())
}
