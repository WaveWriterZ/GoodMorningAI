import { SystemHealth } from './types';

/**
 * HealthClient - Query Mission OS system health
 */
export class HealthClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  /**
   * Get current system health status
   */
  async getHealth(): Promise<SystemHealth> {
    const response = await fetch(`${this.baseUrl}/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    return response.json();
  }
}
