export interface Post {
  slug: string
  number: string
  title: string
  excerpt: string
  author: string
  authorRole: string
  date: string
  readTime: string
  href: string
  body: PostBlock[]
}

export type PostBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "callout"; tone: "info" | "warn"; text: string }
  | { type: "quote"; text: string; cite?: string }

export const posts: Post[] = [
  {
    slug: "four-frameworks",
    number: "01",
    title: "I built four agent frameworks before I built this one.",
    excerpt:
      "Two of them used graphs. One used a YAML DSL. One used decorators. They all shared the same flaw: the harder your problem got, the further you drifted from the source of truth.",
    author: "Kunj Shah",
    authorRole: "Creator, Neuron OS",
    date: "Nov 14, 2025",
    readTime: "9 min",
    href: "/journal/four-frameworks",
    body: [
      {
        type: "p",
        text: "I want to be careful writing this. The people who built the frameworks I'm about to call out are friends of mine. Some of them are brilliant. Most of them have learned things I haven't. But I'm going to say it anyway, because I think it's true, and I think saying it politely would be a disservice: most agent frameworks treat the agent as a callback. And that's the wrong abstraction.",
      },
      {
        type: "p",
        text: "Let me explain what I mean by callback, because the word hides the problem. When you write a LangChain chain, you are wiring up a sequence of function calls. When you build an AutoGen graph, you are wiring up a sequence of function calls. When you write a CrewAI crew, you are wiring up a sequence of function calls. The agent — the thing that actually has state, has tools, has a goal — is implicit. It's a passthrough. The framework is the abstraction; the agent is the side effect.",
      },
      {
        type: "h2",
        text: "The four attempts",
      },
      {
        type: "p",
        text: "I've been writing agent code since 2023. Here's the list.",
      },
      {
        type: "ol",
        items: [
          "Framework 1: a graph DSL. Nodes were tools, edges were conditions. I shipped a 40-node customer-support agent in two weeks. Then the customer changed the workflow. It took me three weeks to rewire the graph. I rewrote it from scratch using plain functions in 4 days.",
          "Framework 2: a YAML manifest. Each agent was a config block; the runtime read the manifest and instantiated things. Pretty, declarative, completely opaque. Six months later I could not tell you which agents existed, what tools they had, or what they'd been called for.",
          "Framework 3: a decorator-based system. You wrote plain Python, decorated your functions, and the framework orchestrated them. Best DX of the four. Also impossible to debug — when something went wrong, the stack trace jumped through six different decorators and the actual error was always in user code, not framework code.",
          "Framework 4: a state machine. Inputs were events, transitions were guards, outputs were side effects. I have genuinely never been more proud of a system I have also genuinely never used in production.",
        ],
      },
      {
        type: "h2",
        text: "What they all had in common",
      },
      {
        type: "p",
        text: "Each of these abstractions solved a real problem at a specific scale. The graph solved the case where I had 20+ tools that all needed to be available to a planner. The YAML solved the case where non-engineers wanted to author agents. The decorator solved the case where I wanted to write code and not configuration. The state machine solved the case where I wanted formal verification of my control flow.",
      },
      {
        type: "p",
        text: "But each abstraction broke the moment my problem moved one step up the complexity ladder. Graphs become spaghetti at 100 nodes. YAML files drift from runtime reality within weeks. Decorators hide the execution model. State machines require you to know the full state space ahead of time — which is exactly what makes a problem hard in the first place.",
      },
      {
        type: "p",
        text: "The thing that killed me, every time, was the same thing: when something went wrong, I could not see what my agent was doing. I could see the inputs. I could see the outputs. I could not see the 30 minutes in the middle.",
      },
      {
        type: "h2",
        text: "The Unix analogy",
      },
      {
        type: "p",
        text: "It took me until this year to realize what I'd been missing. I was treating agents as if they were functions. They're not. They're processes. And processes, in the Unix sense, have a small number of properties that map almost perfectly onto what I actually want from an agent:",
      },
      {
        type: "ul",
        items: [
          "A process has a PID. I want to look up my agent by ID.",
          "A process has open file descriptors. I want to see what tools my agent is currently holding.",
          "A process can be killed. I want to be able to cancel a runaway agent cleanly, not by aborting the runtime.",
          "A process can be inspected with strace. I want a record of every system call the agent made.",
          "A process can be replayed. I want to feed the same input into a fresh process and watch the same decisions happen.",
        ],
      },
      {
        type: "p",
        text: "When I started writing Neuron OS with this model, the abstractions stopped fighting me. An agent is a process. A tool call is a system call. A session is a process tree. A replay is a strace log you can feed back into the kernel. None of this is novel — it's a forty-year-old idea. But applied to agents, it changes almost everything.",
      },
      {
        type: "h2",
        text: "What that means in practice",
      },
      {
        type: "p",
        text: "Here's the API. It's small on purpose:",
      },
      {
        type: "code",
        lang: "typescript",
        code: `import { spawn, kill, list, replay } from "neuron-os"

const agent = await spawn({
  type: "builder",
  goal: "Refactor the auth middleware",
  model: "claude-sonnet-4",
  tools: ["fs.read", "fs.write", "shell.exec"],
})

await agent.run()

const others = await list({ type: "builder", state: "running" })
await kill(others[0].pid, { reason: "stuck" })

const trace = await replay(agent.pid)
console.log(trace.toolCalls)`,
      },
      {
        type: "p",
        text: "No graph. No DSL. No decorators. A process you spawn, observe, kill, and replay. The runtime handles the scheduling, the audit log, the tool scope, the memory. The agent handles the reasoning. They meet in the middle, where they belong.",
      },
      {
        type: "h2",
        text: "Why I'm telling you this",
      },
      {
        type: "p",
        text: "If you've used any of the frameworks I listed and felt a low-grade frustration that you couldn't quite name — I think this is what it was. You were being asked to think in the framework's abstraction, not your problem's abstraction. That gap is the source of the frustration, and it widens the longer you use any system that doesn't see your agent the way you do.",
      },
      {
        type: "p",
        text: "Neuron OS is a bet. The bet is that the OS metaphor — long since the right idea for compute — is also the right idea for agents. If you agree, install it. If you don't, write me and tell me why. Either way, I want to be honest about the fact that this isn't a new idea. It's an old one, finally applied to the right problem.",
      },
      {
        type: "callout",
        tone: "info",
        text: "If you want to dig in, the kernel lives at github.com/neuron-os/kernel. Everything I described here is real and on main. The audit log format is plain JSON, the process table is a SQLite file you can open in any database browser, and the replay tool is a 200-line Go binary. We're not done, but the model is stable.",
      },
    ],
  },
  {
    slug: "audit-log",
    number: "02",
    title: "The audit log that saved our launch.",
    excerpt:
      "Three hours before a customer-facing demo, an agent started emitting answers we couldn't reproduce. A normal CI pipeline would have failed silently. The session replay tool let us scrub backwards, find the exact tool call, and pin it to a regression in a provider SDK.",
    author: "Marcus Rivera",
    authorRole: "ML Platform Lead, Fintech",
    date: "Oct 28, 2025",
    readTime: "6 min",
    href: "/journal/audit-log",
    body: [
      {
        type: "p",
        text: "We were nine days from launch. A paying customer — a regional bank, names redacted for obvious reasons — was running a beta of our agent-driven onboarding flow. The flow does what you think it does: takes a customer service email, classifies it, looks up the customer's account, drafts a response, and either sends it or escalates to a human. We had about 4,000 of these emails flowing through it per day by that point.",
      },
      {
        type: "p",
        text: "I was in the office until 11pm most nights. My partner had stopped asking when I'd be home. But the system was working. I knew it was working because I could see the traces. Every tool call. Every token. Every decision. It was beautiful, and I was proud of it, and I was not prepared for what happened at 2:47pm on a Thursday.",
      },
      {
        type: "h2",
        text: "The first sign something was wrong",
      },
      {
        type: "p",
        text: "The customer paged us. An agent — the one we call the responder, the only one in the chain that talks to customers — was producing answers that didn't match the account data it had been given. The customer showed us a screenshot: 'Hello Mr. Alvarez, your balance is $4,521.00.' Mr. Alvarez's actual balance, per the core banking system, was $145,210.00.",
      },
      {
        type: "p",
        text: "Three hours from a customer-facing demo. I had two engineers, a half-written postmortem doc, and a growing suspicion that I was about to learn what 'regression' really meant in the context of an LLM agent.",
      },
      {
        type: "h2",
        text: "What we tried first (and why it failed)",
      },
      {
        type: "p",
        text: "First instinct: the prompt. We have a 4,000-token system prompt for the responder. Maybe it had drifted. Maybe a token limit had been hit somewhere. We rolled back the prompt to the version from Tuesday. The bad answers kept coming. We rolled back the model. The bad answers kept coming. We rolled back everything we could roll back. The bad answers kept coming.",
      },
      {
        type: "p",
        text: "This is the moment, in any agent system I've ever worked on, where the panic sets in. Because you can't reproduce the bug. You can re-run the same input and get a different answer. You can look at the same prompt and not see the issue. You're not debugging code anymore — you're debugging a probabilistic process that lives in someone else's data center.",
      },
      {
        type: "h2",
        text: "The replay",
      },
      {
        type: "p",
        text: "Then I remembered: we had a session replay URL. Neuron OS writes every tool call, every model request, every model response, and every decision into a JSON log. The URL looks like this:",
      },
      {
        type: "code",
        lang: "shell",
        code: `https://app.neuron-os.dev/sessions/0193f4a1-2c7e-7b1a-9d4f-b8a3c1e2f9a4`,
      },
      {
        type: "p",
        text: "I pulled the session for Mr. Alvarez's bad response. I scrubbed to the tool call where the responder had looked up the account balance. The log entry looked like this (sanitized):",
      },
      {
        type: "code",
        lang: "json",
        code: `{
  "tool": "core.account.lookup",
  "input": { "customer_id": "ALV-44192" },
  "output": {
    "balance": 145210.00,
    "currency": "USD",
    "as_of": "2025-10-23T14:22:01Z"
  },
  "duration_ms": 142
}`,
      },
      {
        type: "p",
        text: "The tool returned the right number. The agent had the right number. I scrubbed forward to the next step — the responder's draft — and there it was:",
      },
      {
        type: "code",
        lang: "json",
        code: `{
  "step": "draft",
  "input_context": {
    "customer_name": "Mr. Alvarez",
    "balance": 145210.00,
    "raw_response": "Hello Mr. Alvarez, your balance is $4,521.00."
  },
  "model": "claude-sonnet-4",
  "model_request_id": "req_01HQZ8K2...",
  "duration_ms": 2417
}`,
      },
      {
        type: "p",
        text: "The model had the right balance in its context. It had emitted the wrong number anyway. There was a single point of failure: the model's output.",
      },
      {
        type: "h2",
        text: "The fix",
      },
      {
        type: "p",
        text: "I cross-referenced the model_request_id against the provider's status page. Sure enough, their SDK had shipped a regression 90 minutes earlier — a serialization bug that truncated large decimal numbers in tool outputs. The SDK had a hotfix; we pinned our version, restarted the responder pool, and the bad answers stopped appearing within 6 minutes.",
      },
      {
        type: "p",
        text: "We made the demo. Mr. Alvarez's account was correctly reported. The customer signed the contract the following week.",
      },
      {
        type: "h2",
        text: "Why I'm writing this",
      },
      {
        type: "p",
        text: "I am not writing this to brag. I am writing this because the thing that saved us was not clever engineering or heroics. It was a log file. A boring, JSON, append-only log file, written by a process I had forgotten was even running.",
      },
      {
        type: "p",
        text: "Audit logs are not glamorous. They are not what you write Medium posts about. They are what you call your best friend at 2:47pm on a Thursday when a customer is on the phone and you cannot reproduce a bug and the launch is in three hours and you do not, at that moment, care about anything other than the truth.",
      },
      {
        type: "callout",
        tone: "warn",
        text: "If you are building an agent system and you do not have a session-level audit log that you can grep — stop reading this and go write one. Everything else in your stack is negotiable. That is not.",
      },
      {
        type: "p",
        text: "Neuron OS writes these logs by default. They're stored in ~/.neuron/sessions/ as plain JSON. You can open them in any text editor, version-control them, ship them to your observability stack, or just `grep` them. We didn't think it was a feature. We thought it was hygiene. Turns out that's the most important kind of feature there is.",
      },
    ],
  },
  {
    slug: "local-first",
    number: "03",
    title: "Local-first is not nostalgia. It's survival.",
    excerpt:
      "Every framework that ships a hosted cloud version starts to rot six months later — features go behind paywalls, breaking changes ship without warning, and your prompt-engineering work is locked to a vendor.",
    author: "Priya Sharma",
    authorRole: "CTO, Healthcare AI",
    date: "Oct 09, 2025",
    readTime: "7 min",
    href: "/journal/local-first",
    body: [
      {
        type: "p",
        text: "I want to talk about something I have watched happen four times in the last three years, and which I now believe is a structural inevitability of the cloud-first model for developer tools: rot.",
      },
      {
        type: "p",
        text: "Rot, in this context, has a specific meaning. It means the steady, predictable decline of a hosted developer platform as the people who built it realize they need to make money, and the people paying for it realize they need features, and the original design — the one that made the platform magical to its first ten thousand users — gets traded away for survival.",
      },
      {
        type: "h2",
        text: "I've watched this four times",
      },
      {
        type: "p",
        text: "In 2022, I watched a hosted ML platform move their free tier's compute cap from 100 GPU-hours per month to 5. The product had not changed. The pricing had. Customers who had built their proof-of-concepts on the free tier woke up to broken pipelines.",
      },
      {
        type: "p",
        text: "In 2023, I watched a popular agent library ship a breaking change to their main SDK, on a Friday afternoon, with two weeks' notice. The library was open source. The hosted version, which was where most users actually ran their code, did not honor the OSS upgrade path. Users spent the weekend rewriting their integrations.",
      },
      {
        type: "p",
        text: "In 2024, I watched a vector database company add a 'mandatory' telemetry hook to their client. It was a one-line config change. It was also a contractual change — by accepting the new client version, customers accepted the new terms. The legal teams I worked with did not find this funny.",
      },
      {
        type: "p",
        text: "In 2025, I watched an LLM provider deprecate a model that I had built an entire product feature around. They gave 30 days' notice. The replacement model was worse at the specific task. We had 30 days to find a new provider, port the prompts, and re-evaluate. We did. It cost us a quarter.",
      },
      {
        type: "h2",
        text: "The pattern",
      },
      {
        type: "p",
        text: "Each of these was a different company. Each of them had different founders, different cultures, different intentions. The pattern is structural, not moral. It is what happens when the platform you depend on is owned by someone who has a quarterly target, a board, and a finite runway.",
      },
      {
        type: "p",
        text: "The platform will optimize for the median customer. The median customer is not you. The median customer is not a healthcare AI company running HIPAA-compliant workflows in 47 states. The median customer is a startup that needs the same feature you do, has the same budget, and will not be the one whose renewal slips.",
      },
      {
        type: "h2",
        text: "What local-first actually means",
      },
      {
        type: "p",
        text: "I am not a romantic about local-first. I don't think it's the right choice because it's philosophically pure. I think it's the right choice because, in the long run, you will own the only copy of your system that matters: the one on your hardware.",
      },
      {
        type: "p",
        text: "When I say 'local-first,' I mean a specific set of properties:",
      },
      {
        type: "ul",
        items: [
          "The binary runs on your machine. Not on a VM. On your laptop, on your server, on the box under your desk.",
          "The data stays on your disk. Sessions, memory, audit logs, vector indices — all of it, in files you can read with cat, grep, or any tool you already have.",
          "The model is pluggable. Anthropic today, Ollama tomorrow, a self-hosted model the day after. The runtime doesn't care.",
          "The license is MIT. The source is on GitHub. You can fork it. You can vendor it. You can never lose access to it.",
          "There is no cloud dependency. You can disconnect from the internet and the system still works — for everything except the part that talks to a remote model, which is a network choice, not a framework choice.",
        ],
      },
      {
        type: "h2",
        text: "What Neuron OS does about it",
      },
      {
        type: "p",
        text: "We took the bet two years ago. Every line of code is MIT. The binary you install is the same one we run. The vault is encrypted with your key; we cannot read it even if we wanted to. The audit log is a JSON file in your home directory. The process table is a SQLite file. The replay tool is a 200-line Go binary.",
      },
      {
        type: "p",
        text: "If we disappear tomorrow, your data is still on your disk. You can still spawn agents. You can still read the logs. You can still grep the trace. You can keep building.",
      },
      {
        type: "p",
        text: "There will be a cloud version of Neuron OS eventually. It will be an option, not a requirement. It will be priced for teams that want a managed runtime. The local version will not be degraded to push people toward the cloud. The local version will not become a 'trial.' We are committing to this in writing because we have watched the other outcome, and we know how it ends.",
      },
      {
        type: "h2",
        text: "Why this is hard",
      },
      {
        type: "p",
        text: "Local-first is genuinely harder to build than cloud-first. The model provider is a network call. The vector index has to live somewhere. The audit log has to be flushed to disk in a way that doesn't kill your SSD. The replay tool has to handle 30-minute sessions without eating all your RAM. None of this is free.",
      },
      {
        type: "p",
        text: "But the cost of building it right is a one-time cost. The cost of being locked out of your own system is a cost you pay forever, with compounding interest, every time the platform's incentives diverge from yours.",
      },
      {
        type: "callout",
        tone: "info",
        text: "If you have ever been bitten by a breaking SDK change, a deprecated model, a paywall that wasn't there last quarter, or a privacy policy that quietly shipped — I think you already know why we made this choice. The rest of this is just engineering.",
      },
    ],
  },
]

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug)
}
