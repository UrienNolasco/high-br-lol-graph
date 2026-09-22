import { HttpException, NotFoundException } from '@nestjs/common';
import {
  failureDelay,
  isPermanentFailure,
  retryAfterMs,
} from './failure-policy';
import { MissingTimelineError } from './processing.constants';

describe('processing retry policy', () => {
  it('honors numeric and HTTP date Retry-After even beyond exponential backoff', () => {
    expect(failureDelay(1, new HttpException({ retryAfter: '120' }, 429))).toBe(
      120_000,
    );
    const now = Date.UTC(2026, 0, 1);
    expect(
      retryAfterMs(
        new HttpException(
          { retryAfter: new Date(now + 180_000).toUTCString() },
          429,
        ),
        now,
      ),
    ).toBe(180_000);
  });
  it('distinguishes a missing match from a pending timeline', () => {
    expect(isPermanentFailure(new NotFoundException())).toBe(true);
    expect(isPermanentFailure(new MissingTimelineError())).toBe(false);
    expect(isPermanentFailure(new HttpException('busy', 429))).toBe(false);
    expect(isPermanentFailure(new HttpException('unavailable', 503))).toBe(
      false,
    );
    expect(isPermanentFailure(new HttpException('bad key', 403))).toBe(true);
  });
});
