import express, { Express, Request, Response } from 'express';
import { getSystemHealth } from '@mission-os/kernel';

const app: Express = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Counter for MSID generation
let msidCounter = 1;

/**
 * Health Check Endpoint (Milestone 3)
 * GET /health
 */
app.get('/health', async (req: Request, res: Response) => {
  try {
    const health = await getSystemHealth();
    res.status(200).json(health);
  } catch (error) {
    res.status(500).json({
      status: 'offline',
      error: 'Failed to retrieve health status',
    });
  }
});

/**
 * Root endpoint
 */
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'Mission OS API',
    version: '0.1.0-alpha',
    status: 'running',
  });
});

/**
 * Generate MSID Endpoint (Milestone 4)
 * POST /identity/generate
 * Returns a unique Mission System ID
 */
app.post('/identity/generate', (req: Request, res: Response) => {
  try {
    const year = new Date().getFullYear();
    const msid = `MS-${year}-KNW-${String(msidCounter).padStart(6, '0')}`;
    msidCounter++;

    res.status(201).json({
      msid,
      timestamp: new Date().toISOString(),
      sequence: msidCounter - 1,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate MSID',
    });
  }
});

/**
 * Start server
 */
app.listen(PORT, () => {
  console.log(`Mission OS API Server running on port ${PORT}`);
  console.log(`Health endpoint: http://localhost:${PORT}/health`);
  console.log(`MSID generation: POST http://localhost:${PORT}/identity/generate`);
});

export default app;
