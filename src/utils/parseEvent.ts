import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { HttpRequest } from '../types/Http';
import { InvalidBodyError } from './httpErrors';

function parseBody(rawBody: string | undefined): Record<string, any> {
  try {
    return JSON.parse(rawBody ?? '{}');
  } catch {
    throw new InvalidBodyError();
  }
}

export function parseEvent(event: APIGatewayProxyEventV2): HttpRequest {
  const body = parseBody(event.body);
  const params = event.pathParameters ?? {};
  const queryParams = event.queryStringParameters ?? {};

  return {
    body,
    params,
    queryParams,
  };
}
