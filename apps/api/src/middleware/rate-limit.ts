import type { NextFunction, Request, Response } from "express";

import { sendError } from "../http/responses.js";

interface RateLimitOptions {
  namespace: string;
  windowMs: number;
  maxRequests: number;
  now?: () => number;
  maxBuckets?: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export function createRateLimit(options: RateLimitOptions) {
  const buckets = new Map<string, RateLimitBucket>();
  const now = options.now ?? Date.now;
  const maxBuckets = options.maxBuckets ?? 10_000;

  return (request: Request, response: Response, next: NextFunction): void => {
    const timestamp = now();
    const identity = request.auth?.userId ?? request.ip ?? "unknown";
    let key = `${options.namespace}:${identity}`;
    if (!buckets.has(key) && buckets.size >= maxBuckets) {
      for (const [candidateKey, candidate] of buckets) {
        if (candidate.resetAt <= timestamp) buckets.delete(candidateKey);
      }
      if (buckets.size >= maxBuckets) key = `${options.namespace}:overflow`;
    }
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= timestamp) {
      bucket = { count: 0, resetAt: timestamp + options.windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, options.maxRequests - bucket.count);
    response.setHeader("RateLimit-Limit", String(options.maxRequests));
    response.setHeader("RateLimit-Remaining", String(remaining));
    response.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > options.maxRequests) {
      response.setHeader(
        "Retry-After",
        String(Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))),
      );
      sendError(
        request,
        response,
        429,
        "RATE_LIMITED",
        "Too many requests. Wait briefly and try again.",
      );
      return;
    }

    next();
  };
}

export const rateLimit = createRateLimit({
  namespace: "api",
  windowMs: 60_000,
  maxRequests: 120,
});
