export interface TestCase {
  name: string
  prompt: string
  expected?: string
  tags?: string[]
  timeout?: number
}

export interface ToolTrace {
  name: string
  params: Record<string, unknown>
  result: string
  durationMs: number
}

export interface EvalResult {
  test: TestCase
  passed: boolean
  output: string
  trace: ToolTrace[]
  steps: number
  totalTokens: number
  durationMs: number
  error?: string
}
