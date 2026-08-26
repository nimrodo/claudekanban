import type { Request, Response, NextFunction } from "express";

export function allowAllOrigins(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
}
