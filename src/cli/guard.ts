import { isCancel } from "@clack/prompts"

export class WizardCancelledError extends Error {
  constructor() {
    super("wizard cancelled")
    this.name = "WizardCancelledError"
  }
}

export function guardCancel<T>(value: T | symbol): T {
  if (isCancel(value)) throw new WizardCancelledError()
  return value
}
