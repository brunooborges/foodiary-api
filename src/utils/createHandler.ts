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

function toErrorResponse(error: unknown): HttpResponse {
  if (error instanceof UnauthorizedError) {
    return unauthorized({ error: error.message });
  }

  if (error instanceof InvalidBodyError) {
    return badRequest({ error: error.message });
  }

  console.error('Unhandled error.', describeError(error));
  return internalServerError({ error: 'Internal server error.' });
}

async function respond(run: () => Promise<HttpResponse>) {
  try {
    return parseResponse(await run());
  } catch (error) {
    return parseResponse(toErrorResponse(error));
  }
}

export function createPublicHandler(controller: Controller<HttpRequest>) {
  return (event: APIGatewayProxyEventV2) => respond(() => controller.handle(parseEvent(event)));
}

export function createProtectedHandler(controller: Controller<ProtectedHttpRequest>) {
  return (event: APIGatewayProxyEventV2) => respond(() => controller.handle(parseProtectedEvent(event)));
}
