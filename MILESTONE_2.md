# Milestone 2 — First Running System

## Objective

Create a minimal, functional Mission OS interface that displays only four core system components with real status information. No placeholder UI, no fake data—everything shown must be backed by actual code and real system state.

## System Display

The application interface shows:

```
Mission OS

Repository Zero
✓ Online

Mission Kernel
✓ Running

Identity Service
✓ Running

System Health
100%
```

## Requirements

### 1. Core Components

#### Mission OS Header
- Display "Mission OS" as the main title
- Shows the current system state

#### Repository Zero Status
- Status indicator: `✓ Online`
- Real verification that Repository Zero is accessible
- Backed by actual connectivity check

#### Mission Kernel Status
- Status indicator: `✓ Running`
- Real verification that the kernel process is active
- Backed by actual process monitoring

#### Identity Service Status
- Status indicator: `✓ Running`
- Real verification that the Identity Service is operational
- Backed by actual service health check

#### System Health
- Display: `100%` (when all systems operational)
- Real calculation based on component statuses
- Formula: (Online Components / Total Components) × 100

### 2. Implementation Architecture

#### Frontend (`apps/web/`)
- Clean, minimal UI components
- Real-time status polling
- No hardcoded values

#### API (`apps/api/`)
- Endpoints to check each system status
- `/status/repository-zero` — Repository accessibility
- `/status/kernel` — Mission Kernel process status
- `/status/identity-service` — Identity Service status
- `/health` — Overall system health

#### Kernel (`packages/kernel/`)
- Core runtime that maintains state
- Process monitoring
- Health calculation logic

#### SDK (`packages/sdk/`)
- Client library for status queries
- Type definitions for system components

### 3. Real Data Sources

Each status must be backed by:
- **Repository Zero**: HTTP connectivity check to repository endpoint
- **Mission Kernel**: Process state verification via process manager
- **Identity Service**: Service endpoint health check
- **System Health**: Aggregated calculation from component states

### 4. No Placeholders

- ❌ No mock data
- ❌ No hardcoded "Running" text
- ❌ No disabled buttons
- ❌ No "Coming Soon" sections
- ✅ Every status reflects actual system state
- ✅ Every display value comes from live queries

## Technical Stack

- **Frontend**: React + TypeScript
- **Backend**: Node.js/Express
- **Build**: pnpm workspace with shared packages
- **Monitoring**: Real-time status polling

## Deliverables

1. **apps/web/src/components/SystemStatus.tsx** — Main status display component
2. **apps/api/src/routes/status.ts** — Status endpoints
3. **packages/kernel/src/health.ts** — Health calculation logic
4. **packages/sdk/src/client.ts** — Client for querying system status
5. **docker-compose.yml** — Local services (Repository, Kernel, Identity Service)

## Success Criteria

✅ Application loads and shows four system statuses
✅ All statuses reflect real system state (not hardcoded)
✅ System Health percentage is accurate
✅ No placeholder UI or fake data
✅ Services can be started/stopped and UI reflects changes
✅ All code is type-safe (TypeScript)

## Implementation Steps

1. Create package.json files for apps and packages
2. Set up Express API with health check endpoints
3. Implement Mission Kernel as runtime service
4. Build React UI component for status display
5. Configure Docker Compose for local services
6. Connect frontend to backend API
7. Test end-to-end: start services, verify status display
