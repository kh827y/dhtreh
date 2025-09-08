import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';

function genId() {
  return 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request & { requestId?: string }, res: Response, next: NextFunction) {
    let id = (req.headers['x-request-id'] as string | undefined) || req.requestId;
    if (!id) id = genId();
    req.requestId = id;
    res.setHeader('X-Request-Id', id);
    next();
  }
}

