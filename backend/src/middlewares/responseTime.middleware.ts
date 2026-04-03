import { NextFunction, Request, Response } from "express";

export function responseTimeMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const startedAt = process.hrtime.bigint();
  const originalEnd = res.end.bind(res);

  res.end = ((chunk?: any, encoding?: any, cb?: any) => {
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    res.setHeader("X-Response-Time", `${elapsedMs.toFixed(2)}ms`);
    return originalEnd(chunk, encoding, cb);
  }) as typeof res.end;

  next();
}
