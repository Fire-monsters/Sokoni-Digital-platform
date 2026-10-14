import { Router, type Request, type Response } from "express";
import { checkReadiness, type ReadinessDependencies } from "./readiness.service.js";

export function createReadinessRouter(deps: ReadinessDependencies = {}): Router {
  const router = Router();

  const handleReadiness = async (_request: Request, response: Response): Promise<void> => {
    const result = await checkReadiness(deps);
    const statusCode = result.ready ? 200 : 503;
    response.status(statusCode).json(result);
  };

  router.get("/ready", handleReadiness);
  router.get("/readyz", handleReadiness);

  return router;
}
