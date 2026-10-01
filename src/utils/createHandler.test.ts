import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { signAccessTokenFor } from '../lib/jwt';
import { createProtectedHandler, createPublicHandler } from './createHandler';
import { ok } from './http';

function buildEvent({
  body = '{}',
  authorization,
}: { body?: string | undefined; authorization?: string } = {}): APIGatewayProxyEventV2 {
  return {
    body,
    headers: authorization ? { authorization } : {},
    pathParameters: { mealId: 'meal-1' },
    queryStringParameters: { date: '2025-01-15' },
    routeKey: 'POST /consent',
    requestContext: { requestId: 'aws-req-1' },
  } as unknown as APIGatewayProxyEventV2;
}

describe('createHandler', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', 'test-secret');
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('createProtectedHandler', () => {
    it('passes the parsed request and the authenticated user to the controller', async () => {
      // Arrange
      const handle = vi.fn().mockResolvedValue(ok({ hello: 'world' }));
      const handler = createProtectedHandler({ handle });
      const token = signAccessTokenFor('user-1');

      // Act
      const response = await handler(buildEvent({ body: '{"a":1}', authorization: `Bearer ${token}` }));

      // Assert
      expect(handle).toHaveBeenCalledWith({
        userId: 'user-1',
        body: { a: 1 },
        params: { mealId: 'meal-1' },
        queryParams: { date: '2025-01-15' },
      });
      expect(response).toEqual({ statusCode: 200, body: JSON.stringify({ hello: 'world' }) });
    });

    it('returns 401 when the access token is missing', async () => {
      // Arrange
      const handle = vi.fn();
      const handler = createProtectedHandler({ handle });

      // Act
      const response = await handler(buildEvent());

      // Assert
      expect(response.statusCode).toBe(401);
      expect(handle).not.toHaveBeenCalled();
    });

    it('returns 401 when the access token is invalid', async () => {
      // Arrange
      const handle = vi.fn();
      const handler = createProtectedHandler({ handle });

      // Act
      const response = await handler(buildEvent({ authorization: 'Bearer not-a-real-token' }));

      // Assert
      expect(response.statusCode).toBe(401);
      expect(handle).not.toHaveBeenCalled();
    });

    it('checks authentication before the body, so an anonymous caller learns nothing from a malformed body', async () => {
      // Arrange
      const handler = createProtectedHandler({ handle: vi.fn() });

      // Act
      const response = await handler(buildEvent({ body: '{oops' }));

      // Assert
      expect(response.statusCode).toBe(401);
    });

    it('returns 400, not 401, when the body is not valid JSON', async () => {
      // Arrange
      const handle = vi.fn();
      const handler = createProtectedHandler({ handle });
      const token = signAccessTokenFor('user-1');

      // Act
      const response = await handler(buildEvent({ body: '{oops', authorization: `Bearer ${token}` }));

      // Assert
      expect(response.statusCode).toBe(400);
      expect(handle).not.toHaveBeenCalled();
    });

    it('returns 500, not 401, when the controller fails, without leaking the error message', async () => {
      // Arrange
      const handle = vi.fn().mockRejectedValue(new Error('connection to db.internal.example failed'));
      const handler = createProtectedHandler({ handle });
      const token = signAccessTokenFor('user-1');

      // Act
      const response = await handler(buildEvent({ authorization: `Bearer ${token}` }));

      // Assert
      expect(response.statusCode).toBe(500);
      expect(response.body).not.toContain('db.internal.example');
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain('db.internal.example');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('logs which route failed, the AWS request id and the real database cause of a 500', async () => {
      // Arrange
      const databaseError = Object.assign(new Error('relation "user_consents" does not exist'), {
        name: 'NeonDbError',
        code: '42P01',
      });
      const handle = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('Failed query: params: user-1'), { cause: databaseError }));
      const handler = createProtectedHandler({ handle });
      const token = signAccessTokenFor('user-1');

      // Act
      await handler(buildEvent({ authorization: `Bearer ${token}` }));

      // Assert
      const [message, details] = vi.mocked(console.error).mock.calls[0];
      expect(message).toBe('Unhandled error.');
      expect(details).toMatchObject({
        route: 'POST /consent',
        requestId: 'aws-req-1',
        cause: { code: '42P01', message: 'relation "user_consents" does not exist' },
      });
      expect(JSON.stringify(details)).not.toContain('user-1');
    });

    it('logs a rejected token as a warning with the route, without the token', async () => {
      // Arrange
      const handler = createProtectedHandler({ handle: vi.fn() });

      // Act
      await handler(buildEvent({ authorization: 'Bearer not-a-real-token' }));

      // Assert
      const [message, details] = vi.mocked(console.warn).mock.calls[0];
      expect(message).toBe('Request rejected.');
      expect(details).toMatchObject({ route: 'POST /consent', requestId: 'aws-req-1', status: 401 });
      expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toContain('not-a-real-token');
    });

    it('logs a malformed body as a warning', async () => {
      // Arrange
      const handler = createPublicHandler({ handle: vi.fn() });

      // Act
      await handler(buildEvent({ body: '{oops' }));

      // Assert
      expect(vi.mocked(console.warn).mock.calls[0][1]).toMatchObject({ route: 'POST /consent', status: 400 });
    });

    it('still works when the event carries no request context', async () => {
      // Arrange
      const handler = createPublicHandler({ handle: vi.fn().mockRejectedValue(new Error('boom')) });
      const event = { body: '{}', headers: {} } as unknown as APIGatewayProxyEventV2;

      // Act
      const response = await handler(event);

      // Assert
      expect(response.statusCode).toBe(500);
    });
  });

  describe('createPublicHandler', () => {
    it('passes the parsed request to the controller without requiring a token', async () => {
      // Arrange
      const handle = vi.fn().mockResolvedValue(ok({ accessToken: 'x' }));
      const handler = createPublicHandler({ handle });

      // Act
      const response = await handler(buildEvent({ body: '{"email":"a@b.c"}' }));

      // Assert
      expect(handle).toHaveBeenCalledWith({
        body: { email: 'a@b.c' },
        params: { mealId: 'meal-1' },
        queryParams: { date: '2025-01-15' },
      });
      expect(response.statusCode).toBe(200);
    });

    it('treats a missing body as an empty object', async () => {
      // Arrange
      const handle = vi.fn().mockResolvedValue(ok());
      const handler = createPublicHandler({ handle });

      // Act
      await handler(buildEvent({ body: undefined }));

      // Assert
      expect(handle).toHaveBeenCalledWith(expect.objectContaining({ body: {} }));
    });

    it('returns 400 when the body is not valid JSON', async () => {
      // Arrange
      const handler = createPublicHandler({ handle: vi.fn() });

      // Act
      const response = await handler(buildEvent({ body: 'not json' }));

      // Assert
      expect(response.statusCode).toBe(400);
    });

    it('returns 500 when the controller fails', async () => {
      // Arrange
      const handler = createPublicHandler({ handle: vi.fn().mockRejectedValue(new Error('boom')) });

      // Act
      const response = await handler(buildEvent());

      // Assert
      expect(response.statusCode).toBe(500);
    });
  });
});
