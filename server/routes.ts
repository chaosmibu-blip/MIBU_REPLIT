import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./replitAuth";
import { adminRateLimiter } from "./middleware/rateLimit";
import { queryLogger } from "./middleware/queryLogger";
import { createTripPlannerRoutes } from "../modules/trip-planner/server/routes";
import { createPlannerServiceRoutes } from "../modules/trip-planner/server/planner-routes";
import { registerStripeRoutes } from "./services/stripe";
import modularRouter from "./routes/index";
import webhooksRouter from "./routes/webhooks";
import merchantRouter from "./routes/merchant";

export async function registerRoutes(app: Express): Promise<Server> {
  await setupAuth(app);

  app.use(webhooksRouter);
  
  app.use('/api', queryLogger);
  app.use('/api/admin', adminRateLimiter);
  
  app.use(merchantRouter);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running correctly!', timestamp: new Date().toISOString() });
  });

  app.get('/api/config/mapbox', (req, res) => {
    const token = process.env.VITE_MAPBOX_ACCESS_TOKEN || '';
    if (!token) {
      return res.status(503).json({ error: 'Mapbox token not configured' });
    }
    res.json({ accessToken: token });
  });

  app.use('/api/planner', createTripPlannerRoutes());
  createPlannerServiceRoutes(app);
  registerStripeRoutes(app);

  app.use('/api', modularRouter);

  const httpServer = createServer(app);
  return httpServer;
}
