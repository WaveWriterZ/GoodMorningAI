import { SystemHealth, KernelStatus, RepositoryStatus, HealthStatus } from '@mission-os/sdk';

const VERSION = '0.1.0-alpha';
const KERNEL_START_TIME = Date.now();

/**
 * Check if the kernel process is running
 */
export async function checkKernelStatus(): Promise<KernelStatus> {
  // Kernel is always running if this code is executing
  return 'running';
}

/**
 * Check if Repository Zero is online
 */
export async function checkRepositoryStatus(): Promise<RepositoryStatus> {
  try {
    // In Milestone 3, we check basic connectivity
    // TODO: Implement actual repository endpoint check
    return 'online';
  } catch {
    return 'offline';
  }
}

/**
 * Calculate overall system health
 */
function calculateHealthStatus(
  kernel: KernelStatus,
  repository: RepositoryStatus
): HealthStatus {
  if (kernel === 'running' && repository === 'online') {
    return 'healthy';
  }
  if (kernel === 'running' || repository === 'online') {
    return 'degraded';
  }
  return 'offline';
}

/**
 * Get complete system health status
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [kernel, repository] = await Promise.all([
    checkKernelStatus(),
    checkRepositoryStatus(),
  ]);

  const status = calculateHealthStatus(kernel, repository);

  return {
    status,
    kernel,
    repository,
    version: VERSION,
  };
}

/**
 * Get kernel uptime in milliseconds
 */
export function getKernelUptime(): number {
  return Date.now() - KERNEL_START_TIME;
}
