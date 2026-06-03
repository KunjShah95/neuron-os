Title: Add WebSocket support for real-time dashboard updates

Description:
The web dashboard (React frontend) currently polls the REST API for agent status updates. This is inefficient and causes stale data. Adding WebSocket support will enable real-time agent event streaming.

Scope:

- Add a WebSocket endpoint to `src/api/server.ts` (e.g., `/api/v1/ws`)
- Bridge `AgentManager` events to the WebSocket (spawn, kill, log, heartbeat, error, exit)
- Update the React dashboard to use WebSocket for real-time agent list and activity feed
- Add reconnection logic with exponential backoff on the client side
- Keep REST API as fallback for initial page load

Acceptance criteria:

- Dashboard updates agent status within 200ms of an event
- WebSocket reconnects automatically on disconnect
- All existing API endpoints remain functional
- CORS and authentication work with WebSocket upgrade
- Server handles 10+ concurrent WebSocket connections

Notes / hints:

- Bun has built-in WebSocket support via `Bun.serve()` — no external dependencies needed
- Use `AgentManager.onEvent()` to bridge events
- On the React side, use the `useEffect` hook to manage connection lifecycle
- Consider `AEGIS_API_WS_PORT` env var to separate WebSocket from HTTP if needed

Estimated effort: 6-8 hours.
