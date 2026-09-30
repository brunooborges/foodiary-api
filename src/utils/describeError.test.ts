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
