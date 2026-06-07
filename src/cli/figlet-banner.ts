/**
 * src/cli/figlet-banner.ts
 *
 * Pre-rendered ASCII art for the launch banner. Replaces the `figlet` runtime
 * dependency so the compiled binary has no font-file lookups at startup
 * (the figlet package reads .flf files from disk at runtime, which fails in
 * the single-binary distribution).
 */

export const NEURON_OS_BANNER = `  _   _                               ___  ____
 | \\ | | ___ _   _ _ __ ___  _ __    / _ \\/ ___|
 |  \\| |/ _ \\ | | | '__/ _ \\| '_ \\  | | | \\___ \\
 | |\\  |  __/ |_| | | | (_) | | | | | |_| |___) |
 |_| \\_|\\___|\\__,_|_|  \\___/|_| |_|  \\___/|____/`

export const AEGIS_BANNER = `     _              _
    / \\   ___  __ _(_)___
   / _ \\ / _ \\/ _\` | / __|
  / ___ \\  __/ (_| | \\__ \\
 /_/   \\_\\___|\\__, |_|___/
              |___/`

export function bannerFor(title: string): string {
  const t = title.toLowerCase()
  if (t.includes("neuron")) return NEURON_OS_BANNER
  return AEGIS_BANNER
}
