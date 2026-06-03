Title: Add WebSocket support for real-time dashboard updates

Description:
Implements Issue #007. Adds WebSocket-based real-time agent event streaming to the API server with SSE fallback.

Changes:

- Added WebSocket endpoint `/api/v1/ws` to `src/api/server.ts` using Bun's built-in WebSocket support
- Added `startWsEventBridge()` / `stopWsEventBridge()` — bridges AgentManager events (spawn, kill, log, heartbeat, error, exit) to connected WebSocket clients
- Sends initial agent state snapshot on connection
- Supports subscribe/unsubscribe/ping messages from clients
- Added SSE fallback endpoint `/api/v1/events` for clients without WebSocket support
- Proper cleanup on server stop: closes all WebSocket connections, stops event bridge
- Auth support for WebSocket connections (uses same `AEGIS_API_KEY` as REST API)

Testing:

- WebSocket clients receive real-time agent events
- SSE endpoint streams events with `text/event-stream`
- All existing API endpoints remain functional
- All existing tests pass

Closes #007
