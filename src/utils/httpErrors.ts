export class UnauthorizedError extends Error {
  constructor(message = 'Invalid access token.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class InvalidBodyError extends Error {
  constructor(message = 'Request body must be valid JSON.') {
    super(message);
    this.name = 'InvalidBodyError';
  }
}
