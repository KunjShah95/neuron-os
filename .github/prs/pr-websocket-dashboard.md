Title: Add WebSocket support for real-time dashboard updates

Description:
Implements Issue #007. Adds WebSocket-based real-time agent event streaming to the web dashboard, replacing HTTP polling.

Changes:

- Added WebSocket endpoint `/api/v1/ws` to the API server
- Bridge AgentManager events (spawn, kill, log, heartbeat, error, exit) to WebSocket
- Updated React dashboard to use WebSocket with reconnection logic
- Kept REST API as fallback for initial page load
- Added `AEGIS_API_WS_PORT` env var for configurable WebSocket port

Testing:

- Dashboard updates within 200ms of agent events
- WebSocket reconnects automatically on disconnect
- All existing REST endpoints remain functional
- CORS and authentication work with WebSocket upgrade

Closes #007
