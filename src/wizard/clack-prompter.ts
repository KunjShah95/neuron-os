import * as p from "@clack/prompts"
import type { Option } from "@clack/prompts"
import type {
  WizardPrompter,
  WizardProgress,
  WizardSelectParams,
  WizardMultiSelectParams,
  WizardTextParams,
  WizardConfirmParams,
} from "./types"
import { guardCancel } from "../cli/guard"

export function createClackPrompter(): WizardPrompter {
  return {
    async intro(title: string) {
      p.intro(title)
    },
    async outro(message: string) {
      p.outro(message)
    },
    async note(text: string, title?: string) {
      p.note(text, title)
    },
    async select<T>(params: WizardSelectParams<T>): Promise<T> {
      return guardCancel(
        await p.select({
          message: params.message,
          options: params.options as Option<T>[],
          initialValue: params.initialValue,
        }),
      )
    },
    async multiselect<T>(params: WizardMultiSelectParams<T>): Promise<T[]> {
      return guardCancel(
        await p.multiselect({
          message: params.message,
          options: params.options as Option<T>[],
          initialValues: params.initialValues,
        }),
      )
    },
    async text(params: WizardTextParams): Promise<string> {
      return guardCancel(
        await p.text({
          message: params.message,
          placeholder: params.placeholder,
          defaultValue: params.defaultValue,
          validate: params.validate as ((value: string) => string | undefined) | undefined,
        }),
      )
    },
    async confirm(params: WizardConfirmParams): Promise<boolean> {
      return guardCancel(
        await p.confirm({
          message: params.message,
          initialValue: params.initialValue,
        }),
      )
    },
    progress(_label: string): WizardProgress {
      const s = p.spinner()
      return {
        start(msg: string) {
          s.start(msg)
        },
        message(msg: string) {
          s.message(msg)
        },
        stop(msg: string) {
          s.stop(msg)
        },
      }
    },
  }
}
