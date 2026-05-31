export interface PlatformMessage {
  id: string
  platform: string
  channelId: string
  userId: string
  userName: string
  text: string
  replyToId?: string
  timestamp: number
}

export interface PlatformSendOptions {
  channelId: string
  text: string
  replyToId?: string
}

export interface PlatformAdapter {
  name: string
  start: () => Promise<void>
  stop: () => Promise<void>
  send: (opts: PlatformSendOptions) => Promise<void>
}
