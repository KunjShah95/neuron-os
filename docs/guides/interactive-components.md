---
title: Interactive Components
description: Demo page showcasing interactive Vue components — API playground, code blocks, and agent type table
---

<script setup lang="ts">
const spawnTabs = [
  { label: "Bash", lang: "bash", code: 'curl -X POST http://localhost:8080/api/v1/agents \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer $API_KEY" \\\n  -d \'{"name":"explorer","type":"read"}\'' },
  { label: "Response", lang: "json", code: '{\n  "id": "agent-4-1717000100",\n  "name": "explorer",\n  "status": "spawning"\n}' },
]
const spawnCommand = 'curl -X POST http://localhost:8080/api/v1/agents -H "Content-Type: application/json" -H "Authorization: Bearer $API_KEY" -d \'{"name":"explorer","type":"read"}\''
const spawnOutput = '{\n  "id": "agent-4-1717000100",\n  "name": "explorer",\n  "status": "spawning"\n}'

const tsTabs = [
  { label: "TypeScript", lang: "ts", code: 'import { agentManager } from "../agent"\n\nconst id = await agentManager.spawn({\n  name: "my-agent",\n  script: "src/agent/agent-worker.ts",\n  agentType: "build",\n  tags: ["frontend"],\n  recovery: { maxRetries: 3, backoffMs: 2000 },\n})\n\nconsole.log(`Agent spawned: ${id}`)' },
  { label: "Output", lang: "text", code: 'Agent spawned: agent-1-1717000000' },
]
const tsCommand = 'bun run -e "import { agentManager } from \'./src/agent\'; const id = await agentManager.spawn({name:\'my-agent\',script:\'src/agent/agent-worker.ts\',agentType:\'build\'}); console.log(`Agent spawned: ${id}`)"'
const tsOutput = 'Agent spawned: agent-1-1717000000'

const simpleTabs = [
  { label: "Bash", lang: "bash", code: 'echo Hello' },
  { label: "Output", lang: "text", code: 'Hello' },
]
</script>

# Interactive Components

This page demonstrates the interactive Vue components available for use in any markdown file.

---

## API Playground

The `<ApiPlayground />` component lets readers explore the REST API directly from the docs. Select an endpoint, fill in parameters, copy the cURL command, and see the expected response.

<ApiPlayground />

---

## Interactive Code Blocks

The `<InteractiveCodeBlock />` component provides tabbed code snippets with a **Run** button that simulates execution.

### Basic Usage

<InteractiveCodeBlock
  :tabs="spawnTabs"
  :run-command="spawnCommand"
  :mock-output="spawnOutput"
  title="Spawn an Agent"
/>

### TypeScript Example

<InteractiveCodeBlock
  :tabs="tsTabs"
  :run-command="tsCommand"
  :mock-output="tsOutput"
  title="Spawning an Agent Programmatically"
/>

---

## Agent Type Table

The `<AgentTypeTable />` component renders a sortable, searchable, filterable table of all 13 built-in agent types.

<AgentTypeTable />

---

## Using Components in Markdown

These components are registered globally — use them in any `.md` file without an import:

```md
## Interactive API Playground

<ApiPlayground />

## Interactive Code Example

<InteractiveCodeBlock
  :tabs="simpleTabs"
  title="Simple Example"
/>

## Agent Types Reference

<AgentTypeTable />
```

With corresponding `<script setup>` block:

```vue
<script setup lang="ts">
const simpleTabs = [
  { label: "Bash", lang: "bash", code: 'echo Hello' },
  { label: "Output", lang: "text", code: 'Hello' },
]
</script>
```

### Props Reference

#### `<InteractiveCodeBlock>`

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `Array<{label, lang, code}>` | — | Array of code tabs to display |
| `runCommand` | `string` | `""` | Command shown when Run button is clicked |
| `mockOutput` | `string` | `""` | Simulated output after clicking Run |
| `title` | `string` | `"Code Example"` | Header title |
