export interface ApiServerConfig {
  port: number
  host: string
  apiKey?: string
  auth?: boolean
  authRequired?: boolean
  corsOrigins?: string
  rateLimitMax?: number
  rateLimitWindowMs?: number
  webhookConfig?: import("./webhook-handler").WebhookConfig
  sessionDb?: boolean
}

export interface ApiRequest {
  method: string
  pathname: string
  headers: Record<string, string>
  body?: unknown
  searchParams?: URLSearchParams
}
