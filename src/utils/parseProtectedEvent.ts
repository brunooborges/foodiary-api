import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { validateAccessToken } from '../lib/jwt';
import { ProtectedHttpRequest } from '../types/Http';
import { parseEvent } from './parseEvent';

export function parseProtectedEvent(event: APIGatewayProxyEventV2): ProtectedHttpRequest {
  const baseEvent = parseEvent(event);

  const { authorization } = event.headers;

  if (!authorization) {
    throw new Error('Access token not provided.');
  }

  const [, accessToken] = authorization.split(' ');

  const userId = validateAccessToken(accessToken);

  if (!userId) {
    throw new Error('Invalid access token.');
  }

  return {
    ...baseEvent,
    userId,
  };
}
