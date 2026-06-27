/**
 * Mission OS SDK - Type Definitions
 */

export type HealthStatus = "healthy" | "degraded" | "offline";
export type KernelStatus = "running" | "starting" | "stopped";
export type RepositoryStatus = "online" | "connecting" | "offline";

export interface SystemHealth {
  status: HealthStatus;
  kernel: KernelStatus;
  repository: RepositoryStatus;
  version: string;
}

export interface ComponentStatus {
  name: string;
  status: "running" | "stopped" | "error";
  uptime?: number;
  lastCheck?: Date;
}
