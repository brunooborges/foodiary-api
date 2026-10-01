type ErrorDetails = {
  name: string;
  status?: number;
  code?: string;
  requestId?: string;
  message?: string;
  cause?: ErrorDetails;
};

const MAX_CAUSE_DEPTH = 3;

// PostgreSQL SQLSTATE codes are five characters (e.g. 42P01 = undefined table, 23505 = unique violation).
const SQLSTATE_PATTERN = /^[0-9A-Z]{5}$/;

// Safe subset of an error for logs. SDK errors carry the upstream response body and message, which can echo
// user content or presigned URLs, so only identifying fields are kept. The one exception is the message of a
// database error found in the cause chain: drizzle wraps failures in an error whose message holds the SQL and its
// parameters, while the cause says what actually went wrong ("relation ... does not exist").
export function describeError(error: unknown, depth = 0): ErrorDetails {
  if (!(error instanceof Error)) {
    return { name: 'UnknownError' };
  }

  // The OpenAI SDK exposes `requestID`; other clients use `request_id`.
  const { status, code, requestID, request_id, cause } = error as Error & Record<string, unknown>;
  const requestId = requestID ?? request_id;
  const isDatabaseError = typeof code === 'string' && SQLSTATE_PATTERN.test(code);

  return {
    name: error.name,
    ...(typeof status === 'number' && { status }),
    ...(typeof code === 'string' && { code }),
    ...(typeof requestId === 'string' && { requestId }),
    ...(depth > 0 && isDatabaseError && { message: error.message }),
    ...(cause instanceof Error && depth < MAX_CAUSE_DEPTH && { cause: describeError(cause, depth + 1) }),
  };
}
