import { APIGatewayProxyEventV2 } from 'aws-lambda';

import { HttpRequest, HttpResponse, ProtectedHttpRequest } from '../types/Http';
import { describeError } from './describeError';
import { badRequest, internalServerError, unauthorized } from './http';
import { InvalidBodyError, UnauthorizedError } from './httpErrors';
import { parseEvent } from './parseEvent';
import { parseProtectedEvent } from './parseProtectedEvent';
import { parseResponse } from './parseResponse';

type Controller<TRequest> = {
  handle(request: TRequest): Promise<HttpResponse>;
};

// Identifies a request in the logs without any user data: the route template (e.g. "GET /meals/{mealId}") and the
// API Gateway request id, which can be searched in CloudWatch.
function describeRequest(event: APIGatewayProxyEventV2) {
  return { route: event.routeKey, requestId: event.requestContext?.requestId };
}

function toErrorResponse(error: unknown, event: APIGatewayProxyEventV2): HttpResponse {
  if (error instanceof UnauthorizedError) {
    console.warn('Request rejected.', { ...describeRequest(event), status: 401, reason: error.message });
    return unauthorized({ error: error.message });
  }

  if (error instanceof InvalidBodyError) {
    console.warn('Request rejected.', { ...describeRequest(event), status: 400, reason: error.message });
    return badRequest({ error: error.message });
  }

  console.error('Unhandled error.', { ...describeRequest(event), ...describeError(error) });
  return internalServerError({ error: 'Internal server error.' });
}

async function respond(event: APIGatewayProxyEventV2, run: () => Promise<HttpResponse>) {
  try {
    return parseResponse(await run());
  } catch (error) {
    return parseResponse(toErrorResponse(error, event));
  }
}

export function createPublicHandler(controller: Controller<HttpRequest>) {
  return (event: APIGatewayProxyEventV2) => respond(event, () => controller.handle(parseEvent(event)));
}

export function createProtectedHandler(controller: Controller<ProtectedHttpRequest>) {
  return (event: APIGatewayProxyEventV2) => respond(event, () => controller.handle(parseProtectedEvent(event)));
}
