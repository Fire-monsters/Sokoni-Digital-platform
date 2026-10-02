import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "./error-handler.js";
import { notFound } from "./not-found.js";

describe("unmatched API routes", () => {
  it.each(["/", "/v1/unknown"])("returns 404 NOT_FOUND for GET %s", (path) => {
    const request = { method: "GET", originalUrl: path, requestId: "test-request" } as Request;
    const json = vi.fn();
    const status = vi.fn().mockReturnValue({ json });
    const response = { status } as unknown as Response;
    const next: NextFunction = (error: unknown) => {
      errorHandler(error, request, response, vi.fn());
    };

    notFound(request, response, next);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route not found: GET ${path}`,
        requestId: "test-request",
      },
    });
  });
});
