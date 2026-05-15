import { AsyncLocalStorage } from 'async_hooks';
import { Injectable, NestMiddleware } from '@nestjs/common';

export interface TraceIdContext {
  traceId: string;
}

export const traceIdStore = new AsyncLocalStorage<TraceIdContext>();

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: () => void) {
    const traceId =
      (req.headers['x-trace-id'] as string) || crypto.randomUUID();
    traceIdStore.run({ traceId }, () => next());
  }
}