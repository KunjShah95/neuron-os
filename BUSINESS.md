# Neuron OS — Business Plan

## Executive Summary

Neuron OS is an open-source operating system for autonomous AI agents — a TypeScript-native CLI, TUI, and runtime that lets developers spawn typed agents, manage costs across 13 AI providers, and productionize agent workflows with built-in observability, security, and distributed execution. Unlike existing agent frameworks that are either too low-level (LangChain) or too opinionated (CrewAI, AutoGPT), Neuron OS treats agents as first-class OS primitives with lifecycle management, tool-level security, cost attribution, and self-improving runtime. The project is currently bootstrapped at v1.0.0 with 6,000+ GitHub stars and an active open-source community. The business model follows a proven open-core pattern: MIT-licensed community edition drives adoption, while Pro ($49/seat/month) and Enterprise (custom) tiers monetize production needs like RBAC, SSO, on-premise deployment, and SLA guarantees.

---

## Product

### What It Is

Neuron OS is the operating system layer between AI models and production agent workflows. It provides:

- **14 typed agent types** (build, plan, read, write, test, validate, review, debug, document, refactor, deploy, monitor, explore, and main) — each with scoped tool permissions, lifecycle hooks, and auto-recovery
- **Multi-platform gateway** — 8 adapters (Discord, Slack, Telegram, SMS, Voice, WhatsApp, Email, Webhook) behind a single interface
- **13 AI providers** — Anthropic, OpenAI, DeepSeek, Groq, Gemini, Mistral, Azure OpenAI, Together AI, Ollama, OpenRouter, xAI, Cohere, Perplexity — with runtime switching and automatic cost-based routing
- **Built-in observability** — distributed tracing, SLO tracking, cost attribution per-task/per-agent, production dashboard, append-only audit log
- **Distributed runtime** — multi-host worker pool with encrypted transport, capacity-aware placement, leader election
- **Self-improving runtime** — skill extraction from successful runs, failure clustering, adversarial self-play, cron-driven improvement scheduler
- **Knowledge infrastructure** — SQLite-backed knowledge graph, vector memory (TF-IDF + cosine similarity), cross-session synthesis, hybrid BM25+Vector+Graph sidecar (95.2% R@5 on LongMemEval-S)
- **Security model** — per-agent tool permissions, pattern-restricted bash, HMAC-signed API, RBAC, AES-256-GCM credential vault with key rotation, Docker sandboxing

### Open-Core Model

- **Community Edition (MIT License)**: All current features — local-first, all 13 providers, CLI/TUI/API, knowledge graph, memory, cost tracking, skill system, MCP integration, triggers engine, benchmarking, self-improvement scheduler, distributed runtime. Full source code available. Free forever.
- **Pro Edition ($49/seat/month)**: RBAC with API key management, encrypted credential vault, distributed runtime (multi-host worker pool), self-improvement scheduler, SLO dashboards & SLA tracking, production dashboard, email support.
- **Enterprise (Custom pricing)**: SSO/SAML/OIDC, audit logging exports (S3, Splunk, Datadog), custom license keys, on-premise deployment support, SLA guarantees (99.9% uptime), dedicated Slack support, custom integration development.

### Key Differentiators

| Dimension | Neuron OS | LangChain | CrewAI | AutoGPT | Vercel AI SDK |
|-----------|-----------|-----------|--------|---------|---------------|
| Architecture | OS-level primitives | Framework/library | Multi-agent orchestration | Standalone agent | Streaming SDK |
| Agent types | 14 typed, permission-scoped | Custom chains | Role-based agents | Single general agent | Custom |
| Provider support | 13 built-in, auto-routed | Many (via integrations) | OpenAI-first | OpenAI-only | Many (via integrations) |
| Cost management | Per-task cost, pre-flight checks, auto-router | None built-in | None built-in | None | None |
| Memory system | Graph + vector + FTS5 + hybrid | Conversation buffers | Basic | Basic vector | None |
| Observability | Tracing, SLO, audit, production dashboard | LangSmith (separate) | None built-in | None | None |
| Distributed runtime | Built-in worker pool | None | None | None | None |
| Self-improvement | Skill extraction, failure clustering, adversarial | None | None | None | None |
| Local-first | Yes (SQLite, Bun, no cloud deps) | Yes | Partial | No | No |
| Security model | Per-agent tools, restricted bash, RBAC, vault | Tool-level (basic) | Basic | Basic | Basic |
| Platform adapters | 8 (Discord, Slack, Telegram, SMS, Voice, WhatsApp, Email, Webhook) | Via integrations | None | None | None |
| License | MIT (community) + commercial (pro/enterprise) | MIT | MIT | MIT | Apache 2.0 |

---

## Market

### Target Customers

Neuron OS serves a funnel of three customer segments:

1. **Solo developers and indie hackers** (~500k developers globally in 2026) building agent-powered tools, personal automation, and side projects. They need local-first, free, self-hostable infrastructure with multi-provider flexibility. They start on the Community Edition and convert to Pro when they need to share agents with a team or deploy to production.

2. **Engineering teams at startups and mid-market companies** (~50k companies) building internal agent workflows, customer-facing AI features, or automated development pipelines. They need RBAC, audit logging, cost tracking across multiple providers, and the ability to run agents in production without vendor lock-in. They buy Pro for their engineering teams and evaluate Enterprise for compliance- sensitive deployments.

3. **Enterprises** (~2k companies) adopting AI agent systems at scale with requirements for SSO, on-premise deployment, audit exports, SLA guarantees, and dedicated support. These are financial services, healthcare, government, and large technology companies. They buy Enterprise.

### Market Sizing

**TAM — Agent Infrastructure Market (2026): $12B**
The total addressable market includes all spending on agent frameworks, orchestration platforms, AI middleware, model gateways, and agent observability tools. This market is growing at ~45% CAGR as enterprises move from chatbot experiments to production agent systems.

**SAM — Open-Source Agent Operating Systems (2026): $1.8B**
The serviceable addressable market narrows to infrastructure that runs locally, supports multiple providers, and provides production-grade observability and security — the segment Neuron OS competes in directly. Key sub-segments: developer tools ($600M), agent orchestration ($700M), and AI observability/cost management ($500M).

**SOM — Realistic 3-Year Capture: $8M ARR**
Neuron OS targets 10,000 Pro subscribers ($49/seat × 1 seat average = ~$600/year) and 50 Enterprise accounts (average $15k/year) within 3 years of commercial launch. This represents ~0.06% of the agent OS SAM — achievable through bottoms-up open-source adoption driving top-down enterprise sales.

### Competitive Landscape

| Competitor | Strength | Weakness vs. Neuron OS |
|-----------|----------|------------------------|
| **LangChain** | Largest ecosystem, most integrations, strong brand | Framework, not OS — no runtime, no agent lifecycle, no distributed execution. LangSmith is separate and paid. |
| **CrewAI** | Best-known multi-agent orchestration brand | OpenAI-focused, no cost management, no typed agents, no self-improvement. Limited to sequential/hierarchical patterns. |
| **AutoGPT** | First-mover brand in autonomous agents | Single-agent, no multitenancy, no production features. Relies on external vector DBs. |
| **Vercel AI SDK** | Excellent streaming UX, React tight integration | Not an agent system — it's a streaming wrapper. No agent types, no memory, no distributed runtime, no security model. |
| **Semantic Kernel** | Microsoft backing, enterprise trust | .NET-centric, C#-first. No typed agent system, no cost router, no 13-provider support. |
| **Dify** | Visual workflow builder, good UX | Cloud-first, not local. No typed agents, no distributed runtime. Less depth in observability. |
| **Flowise** | Drag-and-drop UX, quick prototyping | No production features, no security model, no typed agents. Not designed for serious deployments. |
| **Haystack** | Strong RAG and search pipelines | Not an agent system. No agent types, no multi-provider routing, no distributed execution. |

Neuron OS's core competitive advantage is that it's not a framework — it's an operating system. It provides process isolation (agents as OS processes), lifecycle management (spawn, kill, recover, monitor), resource accounting (CPU, memory, tokens, cost per agent), and a security model (per-agent capabilities, encrypted vault, RBAC) that no framework can match because frameworks don't own the runtime.

---

## Business Model: Open Core

### Community (Free — MIT License)

- [x] All 14 agent types with scoped tool permissions
- [x] 12 TUI modes (dashboard, chat, status, config, skills, cron, memory, agent manager, setup, MCP, cost, router, estimate, insights, benchmark, improve, production, distributed)
- [x] Web dashboard (React 19 + Vite) and marketing website
- [x] Multi-platform gateway (8 adapters: Discord, Slack, Telegram, SMS, Voice, WhatsApp, Email, Webhook)
- [x] All 13 AI providers with runtime switching
- [x] Local-first storage (SQLite — sessions, knowledge graph, vector memory, audit, billing, telemetry)
- [x] MCP integration (client and server)
- [x] Knowledge graph with entity extraction and cross-session synthesis
- [x] Cost attribution with per-task/per-agent tracking
- [x] Model router (auto-selects cheapest viable provider)
- [x] Provider benchmarking (quality vs. cost across all 13 providers)
- [x] Distributed runtime (multi-host worker pool with encrypted transport)
- [x] Self-improvement scheduler (skill extraction, failure clustering, adversarial self-play)
- [x] Docker support with multi-stage build
- [x] HMAC-signed REST API
- [ ] Community support (GitHub Discussions)

### Pro ($49/month — per developer seat)

Everything in Community, plus:

- **RBAC with API key management** — Admin/operator/developer/viewer roles with SHA-256 hashed API keys, route-permission mapping for all 17+ API routes
- **Encrypted credential vault** — AES-256-GCM secrets with scrypt-derived master key, per-entry random IVs, expiration tracking, key rotation, vault-to-provider auto-sync
- **Distributed runtime production mode** — Multi-host worker pool with TCP-based bully leader election, capacity-aware placement, worker heartbeat monitoring, remote management API
- **Self-improvement scheduler** — Cron-driven skill extraction (every 6h), failure clustering (every 12h), adversarial self-play (24h), auto-skill packaging
- **SLO dashboards & SLA tracking** — Rolling-window uptime/latency/error rate with burn rate calculation, alert thresholds
- **Production dashboard** — Aggregated view of SLOs, costs, failures, and agent health across all workers
- **Distributed tracing** — SQLite-backed trace spans with parent-child relationships, per-request waterfall view
- **Email support** (48-hour SLA)
- **Priority GitHub issues** — Pro users get triage priority

### Enterprise (Custom pricing)

Everything in Pro, plus:

- **SSO/SAML/OIDC** — Microsoft Entra ID, Okta, Google Workspace, any SAML 2.0 provider
- **Audit logging exports** — Append-only audit log streamed to S3, Splunk, or Datadog
- **Custom license keys** — Offline license validation for air-gapped deployments
- **On-premise deployment support** — Docker Compose, Kubernetes helm charts, Terraform modules
- **SLA guarantees** — 99.9% uptime SLA for the production API server
- **Dedicated Slack support** — Private Slack channel with the Neuron OS engineering team
- **Custom integration development** — Custom adapters, provider integrations, and security policies built to order
- **Named seat licensing** — Per-developer named seats with usage reporting

---

## Go-to-Market Strategy

### Phase 1: Open-Source Community Growth (Now — Q3 2026)

- **Hacker News launch** — Position Neuron OS as "the OS for AI agents, not another framework." Lead with the 14 typed agent system, 13 providers, and distributed runtime as differentiators.
- **Product Hunt launch** — Demo the TUI dashboard in a screencast. Focus on the "wow" factor of watching agents work in real-time across providers.
- **GitHub star growth** — Target developer blogs, Reddit (r/MachineLearning, r/programming, r/typescript), and technical Twitter/LinkedIn. Current ~6k stars; target 15k by end of 2026.
- **Discord community** — Build an active Discord server for users to share agent workflows, report bugs, and request features. Target 2k members by Q4 2026.
- **Open-core repository** — Maintain clear separation between community and Pro features in the repository. Pro features are present but require a license key.

### Phase 2: Content-Led Demand Generation (Q3 2026 — Q1 2027)

- **Technical blog** — "How to build production agent systems" series: cost optimization across providers, multi-agent debate architectures, self-improving agent loops, distributed agent execution. Each post targets a specific Neuron OS capability.
- **YouTube/Twitch** — Live coding sessions showing agent workflows, benchmarking providers, building custom agent types, and deploying distributed runtimes.
- **Template gallery** — Pre-built agent workflows for common use cases: customer support, code review, social media management, automated testing, document processing.
- **Case studies** — Document real deployments by early community members (with permission). Focus on time saved, cost reduced, and quality improved.

### Phase 3: Partnerships and Enterprise Sales (Q1 2027 — Q2 2027)

- **AI provider partnerships** — Co-marketing with Anthropic, OpenAI, Groq, and others. Neuron OS drives usage to their APIs; they promote Neuron OS to their developer communities.
- **Cloud marketplace listings** — AWS Marketplace, Azure Marketplace, GCP Marketplace for Enterprise deployments.
- **Enterprise sales team** — Hire first enterprise AE. Target companies with existing AI infrastructure investments who need vendor diversity and on-premise options.
- **SOC 2 compliance** — Achieve SOC 2 Type II to unblock financial services and healthcare deals.

---

## Revenue Model

| Tier | Price | Units | ARR per Customer | Target Year 3 |
|------|-------|-------|------------------|----------------|
| Community | Free | Unlimited | $0 | N/A (growth driver) |
| Pro | $49/seat/month | ~1.2 avg seats | ~$600 | 10,000 subscribers = $6M ARR |
| Enterprise | Custom ($500-2k/seat/year) | ~15 avg seats | ~$15k | 50 accounts = $750k ARR |
| **Total** | | | | **~$6.75M ARR** |

### Unit Economics

- **Pro CAC**: ~$45 (self-serve via content marketing, GitHub stars, product-led growth)
- **Pro LTV**: ~$1,800 (3-year average retention at $600/year)
- **Enterprise CAC**: ~$5,000 (sales-led with demo, POC, procurement cycle)
- **Enterprise LTV**: ~$45,000 (3-year contract at $15k/year)
- **Gross margin**: ~92% (hosting costs are minimal — user self-hosts; costs are GitHub, Discord, email support, cloud infrastructure for CI/build)

### Pricing Rationale

$49/seat/month positions Neuron OS between premium developer tools (GitHub Copilot at $19/month, Linear at $8/seat/month) and enterprise observability platforms (Datadog at $15/host/month, Splunk at $150/GB/month). The price reflects that Neuron OS replaces multiple tools — an agent framework, an observability platform, a cost management tool, and a secrets manager — while being self-hosted (no cloud infrastructure costs for the customer).

---

## Development Roadmap

### Q3 2026: v0.11.0 — Plugin Marketplace & WebSocket Gateway

- **Plugin Registry** — Signed plugins with version resolution and dependency management. Plugin attestation via Sigstore for supply-chain security.
- **Plugin CLI** — `aegis plugin {publish,install,list,remove,verify}` with signature verification against registry.
- **WebSocket Gateway** — Real-time multi-user dashboards with per-user agent state subscriptions. Enables team dashboards without sharing terminals.
- **Multi-User Sessions** — Shared agent workspaces with activity streaming across WebSocket connections.
- **Business milestone**: Pro tier launch with RBAC and vault — first $1k MRR target.

### Q4 2026: v0.12.0 — Multi-Agent Teams at Scale

- **Typed Multi-Agent Trees** — Agents declare typed inputs, outputs, and preconditions. Compile-time validation of agent composition.
- **Coordinator Election** — Dynamic lead agent selection by capability matching. No single point of failure.
- **Debate Topology** — Third-agent arbitration for agent disagreement resolution. Built on the existing typed IPC protocol.
- **Cross-Team Memory** — Team A's learnings queryable by Team B with explicit access policies on the knowledge graph.
- **Business milestone**: Enterprise tier launch with SSO/SAML — first enterprise pilot.

### Q1 2027: v0.13.0 — Tool-Level Economy

- **Per-Tool Pricing** — Every tool has compute/API/I-O cost and latency profile. Model router extends to tool routing.
- **Budgeted Agents** — `budget_usd` on task definitions. Agent self-throttles spend by choosing cheaper tools or providers mid-execution.
- **Spot Routing** — Cross-provider cost router that polls current cheapest provider per model class and routes accordingly.
- **Public Benchmarks** — Quality-per-dollar leaderboard per provider per task class. Published monthly.
- **Cost Spike Alerts** — Automated Slack/Discord webhook alerts on budget breach with root-cause analysis.
- **Business milestone**: $50k MRR target. Hire first developer advocate.

### Q2 2027: v1.0.0 — Production GA

- **Enterprise Licensing** — License key validation, offline mode, usage reporting, named seats. Full commercial feature set.
- **SOC 2 Readiness** — Audit logging exports, access controls, data retention policies aligned with SOC 2 requirements.
- **Helm Charts** — Production-grade Kubernetes deployment with horizontal scaling, persistent volumes, and rolling updates.
- **Terraform Modules** — One-command cloud deployment for AWS, Azure, and GCP.
- **Business milestone**: $100k MRR, 50 enterprise accounts, SOC 2 Type I certified.

---

## Team & Hiring

### Current

- **Solo founder** — Full-stack TypeScript, AI/ML infrastructure, product design, and open-source community management. Responsible for all code, architecture, documentation, marketing, and strategy.

### First Hires (When Funded)

1. **Full-stack engineer (TypeScript, React, infrastructure)** — $120-150k + equity
   - Own plugin marketplace, WebSocket gateway, dashboard v2
   - Maintain CI/CD, Docker builds, GitHub automation
   - Background in developer tools or infrastructure software
   - Hire at $50k MRR (Q1 2027)

2. **Developer advocate / content marketer** — $100-130k + equity
   - Write technical blog posts, tutorials, documentation
   - Grow Discord, Twitter/X, YouTube presence
   - Speak at conferences, run workshops, build template gallery
   - Manage Hacker News, Product Hunt, and Reddit launches
   - Hire at $50k MRR (Q1 2027)

3. **AI/ML engineer** — $130-160k + equity
   - Own the self-improvement runtime (skill extraction, failure clustering, adversarial self-play)
   - Improve AgentMemory sidecar (BM25+Vector+Graph hybrid)
   - Build public benchmarks and quality-per-dollar leaderboard
   - Research new agent architectures and memory systems
   - Hire at $100k MRR (Q2 2027)

### Future Roles

- Enterprise account executive ($150k OTE + equity) — hire at $75k MRR
- Solutions engineer ($130k + equity) — hire at $100k MRR
- Customer success manager ($90k + equity) — hire at $150k MRR

---

## Funding Strategy

### Bootstrap Phase (Now — $10k MRR)

- **Current state**: Bootstrapped, solo founder, zero external funding
- **Cost structure**: ~$2,000/month (GitHub Pro, CI/CD credits, cloud hosting for demo infra, domain/email, LLM credits for testing)
- **Path to $10k MRR**: 200 Pro subscribers at $49/seat ($9,800 MRR) plus 2-3 enterprise pilots ($5-10k). Likely timeline: 12-18 months from Pro launch.
- **Burn multiple**: ~6 months of personal runway at current costs. Extended through consulting/contracting as needed.

### Pre-Seed Round (At $10k MRR)

- **Target**: $500k from developer tool angels, AI infrastructure investors
- **Instrument**: SAFE with $5M cap
- **Use of funds**:
  - Hire engineer and developer advocate (~$180k/year combined)
  - Infrastructure scaling ($60k/year — CI runners, cloud demo environments, plugin registry hosting)
  - Legal and compliance ($40k — SOC 2 readiness, license structuring, trademark)
  - Marketing and events ($40k — conference sponsorships, content production)
  - Founder salary ($180k/year)
- **Runway extension**: 18-24 months with the round
- **Key investors to target**: AI engineers turned angels, dev tool investors (e.g., A16Z Ops, Sequoia Arc, Y Combinator alums), solo-founder-friendly funds (e.g., Tiny Seed, Wischoff Ventures)

### Series A (At $500k MRR — ~Year 3)

- **Target**: $3-5M
- **Use of funds**: Scale sales and customer success for enterprise, expand to 8-10 person team, achieve SOC 2 Type II, go multi-cloud with marketplace listings

---

## Risk Analysis

### LLM Provider Commoditization

**Threat**: As AI models become interchangeable commodities, the value of multi-provider routing decreases. If the big 3 (OpenAI, Anthropic, Google) converge on price and quality, the cost router's value proposition weakens.

**Mitigation**: Neuron OS's value is not in provider abstraction — it's in the agent OS layer (lifecycle, security, observability, memory, self-improvement). Provider support is table stakes. The real moat is the runtime. Additionally, commoditization actually helps Neuron OS: more providers means more routing complexity, which our system handles natively.

**Opportunity**: Commoditization drives price wars, which drives demand for cost optimization tools. Every provider price drop is a Neuron OS blog post.

### Open-Source Competitors with More Funding

**Threat**: LangChain ($25M raised), CrewAI ($18M) and other well-funded competitors could build competing runtime features. Vercel AI SDK has massive distribution through Vercel's existing developer audience.

**Mitigation**: The open-core model creates a distribution advantage — MIT license means no barriers to adoption, which builds community and ecosystem before enterprise features become relevant. Competitors funded with VC money need to show growth at any cost; Neuron OS can afford to build slower but more deliberately, targeting production reliability rather than feature breadth.

**Counter-positioning**: Frameworks focus on "composability" (LangChain chains, CrewAI roles). Neuron OS focuses on "production" — can you run this for 30 days without an incident? Frameworks struggle here because they don't own the runtime.

### Enterprise Sales Cycle Length

**Threat**: Enterprise deals for infrastructure software typically take 6-12 months from first contact to signed contract. SOC 2 requirements, procurement reviews, and security audits are gatekeepers.

**Mitigation**: Bottoms-up adoption through the Community Edition is the primary lead generation channel. Enterprise prospects are already using Neuron OS before they buy — they've seen it work, they trust it, and they're buying for compliance features (SSO, audit exports, SLA) rather than evaluating the core technology. Enterprise sales become a conversion event rather than a cold discovery.

**The bottom-up wedge**: Developers install Neuron OS (Community). Their team adopts it. The team deploys it in production. Operations asks for RBAC and audit logging. IT asks for SSO. The company buys Enterprise. This funnel compresses the sales cycle from 12+ months to 3-4 months because the technical evaluation has already happened.

### Summary Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| LLM commoditization | High | Low | Runtime is the moat, not provider abstraction |
| Well-funded competitors | Medium | Medium | Open-source distribution + production focus |
| Enterprise sales velocity | Medium | High | Bottoms-up adoption compresses eval cycle |
| Single-founder key person risk | High | High | Revenue-funded hiring before cash runs out |
| Open-source monetization resistance | Medium | Medium | Clear open-core line, commercial features are enterprise needs, not core agent features |
| AI market slowdown | Low | High | Targeting developer productivity (recession-resistant) and enterprise AI transformation (long-cycle, committed budgets) |

---

## Appendix: Commercial Feature Flag Mapping

The following table maps every Neuron OS feature to its license tier. This is the internal guide for repository organization — commercial features are present in the codebase but gated behind license key validation.

| Feature | License | Notes |
|---------|---------|-------|
| 14 agent types | MIT | All community |
| 12 TUI modes | MIT | All community |
| 8 platform adapters | MIT | All community |
| 13 AI providers | MIT | All community |
| Cost attribution | MIT | Community includes per-task cost |
| Model router | MIT | Community includes auto-routing |
| Provider benchmarking | MIT | All community |
| Knowledge graph | MIT | All community |
| Vector memory | MIT | All community |
| Cross-session synthesis | MIT | All community |
| MCP client/server | MIT | All community |
| Skill system | MIT | All community |
| Triggers engine | MIT | All community |
| Docker support | MIT | All community |
| Distributed runtime (basic) | MIT | Single-host worker pool only |
| Self-improvement scheduler | MIT | Basic scheduler |
| HMAC REST API | MIT | All community |
| RBAC | Pro | Role management, API key hashing |
| Credential vault | Pro | AES-256-GCM encryption |
| Distributed runtime (multi-host) | Pro | Multi-host with leader election |
| SLO dashboards | Pro | Production dashboards |
| Distributed tracing | Pro | Trace spans |
| Email support | Pro | 48-hour SLA |
| SSO/SAML/OIDC | Enterprise | Identity federation |
| Audit log exports | Enterprise | S3, Splunk, Datadog |
| Custom license keys | Enterprise | Offline validation |
| On-premise support | Enterprise | Helm, Terraform, air-gap |
| SLA guarantees | Enterprise | 99.9% uptime |
| Dedicated support | Enterprise | Private Slack channel |
| Custom integrations | Enterprise | Built-to-order adapters |
