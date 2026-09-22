import { HttpException } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { InvalidMatchError } from './processing.constants';

export function httpStatus(error: unknown): number | undefined {
  if (error instanceof HttpException) return error.getStatus();
  if (isAxiosError(error)) return error.response?.status;
}

export function retryAfterMs(error: unknown, now = Date.now()): number {
  let value: unknown;
  if (isAxiosError(error)) value = error.response?.headers?.['retry-after'];
  if (error instanceof HttpException) {
    const body = error.getResponse();
    if (typeof body === 'object' && 'retryAfter' in body)
      value = body.retryAfter;
  }
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(String(value));
  return Number.isFinite(date) ? Math.max(0, date - now) : 0;
}

export function isPermanentFailure(error: unknown): boolean {
  if (error instanceof InvalidMatchError) return true;
  const status = httpStatus(error);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![408, 429].includes(status)
  );
}

export function failureDelay(attempt: number, error: unknown): number {
  return Math.max(
    Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 900_000),
    retryAfterMs(error),
  );
}
