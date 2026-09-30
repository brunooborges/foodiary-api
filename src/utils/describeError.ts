type ErrorDetails = {
  name: string;
  status?: number;
  code?: string;
  requestId?: string;
};

// Safe subset of an error for logs. SDK errors carry the upstream response body and message, which can echo
// user content or presigned URLs, so only identifying fields are kept.
export function describeError(error: unknown): ErrorDetails {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError' };
  }

  // The OpenAI SDK exposes `requestID`; other clients use `request_id`.
  const { status, code, requestID, request_id } = error as Error & Record<string, unknown>;
  const requestId = requestID ?? request_id;

  return {
    name: error.name,
    ...(typeof status === 'number' && { status }),
    ...(typeof code === 'string' && { code }),
    ...(typeof requestId === 'string' && { requestId }),
  };
}
