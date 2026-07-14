import type { Response } from "express";

export interface ApiErrorShape {
  code: string;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export function sendData<T>(res: Response, data: T, status = 200, meta: Record<string, unknown> = {}) {
  return res.status(status).json({ data, error: null, meta });
}

export function sendError(res: Response, status: number, error: ApiErrorShape) {
  return res.status(status).json({ data: null, error, meta: {} });
}

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
  }
}
