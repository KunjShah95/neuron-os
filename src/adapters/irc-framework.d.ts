declare module "irc-framework" {
  interface ClientOptions {
    host: string
    port: number
    nick: string
    password?: string
    tls?: boolean
    version?: string | null
  }

  interface MessageEvent {
    message?: string
    nick?: string
    target?: string
    ident?: string
    hostname?: string
    group?: string
    time?: string
  }

  class Client {
    constructor()
    connect(opts: ClientOptions): void
    join(channel: string): void
    part(channel: string): void
    say(target: string, text: string): void
    quit(reason?: string): void
    on(event: "registered", cb: () => void): void
    on(event: "message", cb: (event: MessageEvent) => void): void
    on(event: "error", cb: (err: Error) => void): void
    on(event: "close", cb: () => void): void
    once(event: "registered", cb: () => void): void
    once(event: "close", cb: () => void): void
  }

  export { Client }
}
