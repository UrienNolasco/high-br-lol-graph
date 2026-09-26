import { HttpException } from '@nestjs/common';
import { isAxiosError } from 'axios';

/** Extract an HTTP status without coupling callers to an API client. */
export function httpStatus(error: unknown): number | undefined {
  if (error instanceof HttpException) return error.getStatus();
  if (isAxiosError(error)) return error.response?.status;
}
