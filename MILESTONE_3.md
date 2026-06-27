# Milestone 3 — First API

## Objective

Create the foundational API endpoint that exposes real-time system health and component status. This is the first public interface to Mission OS systems.

## Primary Endpoint

### GET /health

Returns the current health status of all core Mission OS components.

#### Request

```http
GET /health
Host: localhost:3000
```

#### Response (200 OK)

```json
{
  "status": "healthy",
  "kernel": "running",
  "repository": "online",
  "version": "0.1.0-alpha"
}
```

#### Response Fields

- **status**: Overall system status
  - `healthy` — All components operational
  - `degraded` — Some components not fully operational
  - `offline` — System not operational

- **kernel**: Mission Kernel status
  - `running` — Kernel process is active
  - `starting` — Kernel initializing
  - `stopped` — Kernel not running

- **repository**: Repository Zero connectivity
  - `online` — Repository accessible
  - `connecting` — Repository connection in progress
  - `offline` — Repository unreachable

- **version**: Mission OS version
  - SemVer format: `major.minor.patch-prerelease`
  - Current: `0.1.0-alpha`

## Implementation Requirements

### 1. Backend (apps/api/)

#### Express Server Setup
- Create HTTP server on port 3000
- Implement `/health` endpoint
- Return JSON with proper Content-Type headers

#### Health Check Logic
```typescript
// Pseudocode
async function getHealthStatus() {
  const kernelStatus = await checkKernelStatus();
  const repositoryStatus = await checkRepositoryStatus();
  const overallStatus = calculateOverallStatus(kernelStatus, repositoryStatus);
  
  return {
    status: overallStatus,
    kernel: kernelStatus,
    repository: repositoryStatus,
    version: "0.1.0-alpha"
  };
}
```

#### Status Determination
- **Kernel Status**: Check if kernel process is running
- **Repository Status**: Perform HTTP connectivity check
- **Overall Status**: 
  - `healthy` if kernel AND repository are both operational
  - `degraded` if one component is not fully operational
  - `offline` if kernel is not running

### 2. Kernel Package (packages/kernel/)

#### Health Check Module
- Export `getKernelStatus()` function
- Return process state
- Track uptime and version

#### Service Health Checks
- Abstract health check interface for all services
- Implement for Repository Zero connectivity
- Implement for Identity Service (prep for Milestone 2 integration)

### 3. SDK Package (packages/sdk/)

#### Health Client
- Export `HealthClient` class
- Method: `getHealth()` returns Promise<HealthStatus>
- Type definitions for HealthStatus interface

#### Type Definitions
```typescript
interface HealthStatus {
  status: "healthy" | "degraded" | "offline";
  kernel: "running" | "starting" | "stopped";
  repository: "online" | "connecting" | "offline";
  version: string;
}
```

### 4. Testing

#### Unit Tests
- Test health status calculation logic
- Test status determination rules
- Test version string format

#### Integration Tests
- Start services
- Call GET /health endpoint
- Verify response format and values
- Verify status changes when services stop/start

#### HTTP Tests
```bash
# Test endpoint
curl http://localhost:3000/health

# Expected response
{
  "status": "healthy",
  "kernel": "running",
  "repository": "online",
  "version": "0.1.0-alpha"
}
```

## Technical Stack

- **Server**: Express.js (Node.js)
- **Language**: TypeScript
- **Port**: 3000
- **Format**: JSON

## Deliverables

1. **apps/api/src/routes/health.ts** — Health endpoint handler
2. **apps/api/src/index.ts** — Express server setup
3. **packages/kernel/src/health.ts** — Health check logic
4. **packages/sdk/src/types.ts** — HealthStatus type definition
5. **packages/sdk/src/health-client.ts** — Health client
6. **apps/api/package.json** — Dependencies and scripts
7. **Integration tests** — Verify endpoint behavior

## Success Criteria

✅ GET /health endpoint responds on localhost:3000
✅ Response includes all four required fields
✅ Response format matches specification exactly
✅ Status values are accurate and reflect actual component state
✅ Kernel status changes when process stops/starts
✅ Repository status changes when connectivity is lost
✅ Overall status correctly aggregates component states
✅ Version field is "0.1.0-alpha"
✅ All responses return HTTP 200 (even if degraded)
✅ Content-Type is application/json

## Health Status State Machine

```
Healthy State
├─ kernel: "running" ✓
├─ repository: "online" ✓
└─ status: "healthy"

Degraded States
├─ kernel: "running", repository: "offline"
│  └─ status: "degraded"
├─ kernel: "starting", repository: "online"
│  └─ status: "degraded"
└─ kernel: "stopped", repository: "online"
   └─ status: "offline"

Offline State
├─ kernel: "stopped" ✓
└─ status: "offline"
```

## Next Steps (Milestone 4)

- Add `/identity-service/status` endpoint
- Expand health response with Identity Service state
- Implement real-time status polling
- Add websocket support for live updates
