/**
 * Component status tracking
 */

export interface ComponentState {
  name: string;
  running: boolean;
  startTime: Date;
  lastHealthCheck: Date;
}

const components: Map<string, ComponentState> = new Map();

/**
 * Register a component
 */
export function registerComponent(name: string): void {
  components.set(name, {
    name,
    running: true,
    startTime: new Date(),
    lastHealthCheck: new Date(),
  });
}

/**
 * Update component health check time
 */
export function updateComponentHealthCheck(name: string): void {
  const component = components.get(name);
  if (component) {
    component.lastHealthCheck = new Date();
  }
}

/**
 * Get all components
 */
export function getAllComponents(): ComponentState[] {
  return Array.from(components.values());
}
