export interface WizardOption<T> {
  value: T
  label: string
  hint?: string
  disabled?: boolean
}

export interface WizardSelectParams<T> {
  message: string
  options: WizardOption<T>[]
  initialValue?: T
}

export interface WizardMultiSelectParams<T> {
  message: string
  options: WizardOption<T>[]
  initialValues?: T[]
}

export interface WizardTextParams {
  message: string
  placeholder?: string
  defaultValue?: string
  validate?: (value: string) => string | undefined
}

export interface WizardConfirmParams {
  message: string
  initialValue?: boolean
}

export interface WizardProgress {
  start(msg: string): void
  message(msg: string): void
  stop(msg: string): void
}

export interface WizardPrompter {
  intro(title: string): Promise<void>
  outro(message: string): Promise<void>
  note(text: string, title?: string): Promise<void>
  select<T>(params: WizardSelectParams<T>): Promise<T>
  multiselect<T>(params: WizardMultiSelectParams<T>): Promise<T[]>
  text(params: WizardTextParams): Promise<string>
  confirm(params: WizardConfirmParams): Promise<boolean>
  progress(label: string): WizardProgress
}
