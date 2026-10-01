import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { validateAccessToken } from '../lib/jwt';
import { ProtectedHttpRequest } from '../types/Http';
import { UnauthorizedError } from './httpErrors';
import { parseEvent } from './parseEvent';

export function parseProtectedEvent(event: APIGatewayProxyEventV2): ProtectedHttpRequest {
  // Authentication comes first: an anonymous caller must get 401 whatever the body looks like.
  const { authorization } = event.headers;

  if (!authorization) {
    throw new UnauthorizedError('Access token not provided.');
  }

  const [, accessToken] = authorization.split(' ');

  const userId = validateAccessToken(accessToken);

  if (!userId) {
    throw new UnauthorizedError();
  }

  const baseEvent = parseEvent(event);

  return {
    ...baseEvent,
    userId,
  };
}
