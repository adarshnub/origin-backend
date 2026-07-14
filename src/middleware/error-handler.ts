import type { ErrorRequestHandler } from "express";
import { AppError, sendError } from "../lib/api.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    sendError(res, error.status, {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  if (typeof error === "object" && error !== null && "type" in error && error.type === "entity.parse.failed") {
    sendError(res, 400, { code: "INVALID_JSON", message: "Request body must be valid JSON." });
    return;
  }

  console.error(error);
  sendError(res, 500, { code: "INTERNAL_ERROR", message: "Something went wrong." });
};
