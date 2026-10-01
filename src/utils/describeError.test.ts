import OpenAI from 'openai';
import { describe, expect, it } from 'vitest';

import { describeError } from './describeError';

describe('describeError', () => {
  it('keeps only identifying fields of a real OpenAI SDK error, never its message or body', () => {
    // Arrange
    const leakyMessage = 'could not fetch https://bucket.s3.amazonaws.com/file.jpg?X-Amz-Signature=topsecret';
    const error = OpenAI.APIError.generate(
      404,
      { error: { message: leakyMessage, code: 'provider_error', raw: 'user content echoed back' } },
      leakyMessage,
      new Headers({ 'x-request-id': 'req-123' }),
    );

    // Act
    const details = describeError(error);

    // Assert
    expect(details).toEqual({
      name: 'Error',
      status: 404,
      code: 'provider_error',
      requestId: 'req-123',
    });
    expect(JSON.stringify(details)).not.toContain('topsecret');
    expect(JSON.stringify(details)).not.toContain('user content echoed back');
  });

  it('exposes the database error hidden behind the query error that drizzle wraps it in', () => {
    // Arrange: drizzle puts the SQL and its parameters in the outer message and the real failure in `cause`.
    const databaseError = Object.assign(new Error('relation "user_consents" does not exist'), {
      name: 'NeonDbError',
      code: '42P01',
    });
    const queryError = Object.assign(new Error('Failed query: select ... params: user-123,secret@mail.com'), {
      name: 'DrizzleQueryError',
      cause: databaseError,
    });

    // Act
    const details = describeError(queryError);

    // Assert
    expect(details).toEqual({
      name: 'DrizzleQueryError',
      cause: { name: 'NeonDbError', code: '42P01', message: 'relation "user_consents" does not exist' },
    });
    expect(JSON.stringify(details)).not.toContain('secret@mail.com');
  });

  it('keeps the message of a cause only when it is a database error', () => {
    // Arrange
    const networkError = Object.assign(new Error('connect ECONNRESET https://x.example/?sig=topsecret'), {
      code: 'ECONNRESET',
    });
    const error = Object.assign(new Error('wrapper'), { cause: networkError });

    // Act
    const details = describeError(error);

    // Assert
    expect(details).toEqual({ name: 'Error', cause: { name: 'Error', code: 'ECONNRESET' } });
    expect(JSON.stringify(details)).not.toContain('topsecret');
  });

  it('follows a chain of causes only a few levels deep', () => {
    // Arrange
    const chain = [1, 2, 3, 4, 5].reduce<Error | undefined>(
      (cause, level) => Object.assign(new Error(`level ${level}`), { name: `Level${level}`, cause }),
      undefined,
    );

    // Act
    const details = describeError(chain);

    // Assert
    const depth = (value: { cause?: unknown }): number =>
      value.cause ? 1 + depth(value.cause as { cause?: unknown }) : 0;
    expect(depth(details)).toBeLessThanOrEqual(3);
  });

  it('understands the snake_case request id used by other clients', () => {
    // Arrange
    const error = Object.assign(new Error('boom'), { request_id: 'req-456' });

    // Act & Assert
    expect(describeError(error)).toEqual({ name: 'Error', requestId: 'req-456' });
  });

  it('describes a plain error by name only', () => {
    expect(describeError(new TypeError('secret detail'))).toEqual({ name: 'TypeError' });
  });

  it('does not leak anything from a value that is not an Error', () => {
    expect(describeError('https://bucket.example/file?X-Amz-Signature=topsecret')).toEqual({ name: 'UnknownError' });
    expect(describeError(undefined)).toEqual({ name: 'UnknownError' });
  });
});
