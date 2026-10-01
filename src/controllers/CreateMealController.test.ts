import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const values = vi.fn(() => ({ returning }));

  return {
    returning,
    values,
    insert: vi.fn(() => ({ values })),
    getSignedUrl: vi.fn(),
    findConsent: vi.fn(),
  };
});

vi.mock('../db', () => ({
  db: { insert: mocks.insert, query: { userConsentsTable: { findFirst: mocks.findConsent } } },
}));
vi.mock('../clients/s3Client', () => ({ s3Client: {} }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }));

import { CURRENT_CONSENT_VERSION } from '../lib/consent';
import { CreateMealController } from './CreateMealController';

const MEGABYTE = 1024 * 1024;

function buildRequest(body: Record<string, unknown>) {
  return { userId: 'user-1', body, queryParams: {}, params: {} };
}

describe('CreateMealController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.returning.mockResolvedValue([{ id: 'meal-1' }]);
    mocks.getSignedUrl.mockResolvedValue('https://bucket.example/upload?sig=1');
    mocks.findConsent.mockResolvedValue({ version: CURRENT_CONSENT_VERSION, status: 'accepted' });
    vi.stubEnv('BUCKET_NAME', 'test-bucket');
    vi.stubEnv('MAX_AUDIO_FILE_BYTES', '');
    vi.stubEnv('MAX_IMAGE_FILE_BYTES', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates the meal and returns an upload URL signed for the exact declared size', async () => {
    // Act
    const response = await CreateMealController.handle(
      buildRequest({ fileType: 'audio/m4a', fileSize: 2 * MEGABYTE }),
    );

    // Assert
    expect(response).toEqual({
      statusCode: 201,
      body: { mealId: 'meal-1', uploadURL: 'https://bucket.example/upload?sig=1' },
    });

    const [, command, options] = mocks.getSignedUrl.mock.calls[0];
    expect(command.input).toEqual(
      expect.objectContaining({ Bucket: 'test-bucket', ContentLength: 2 * MEGABYTE, Key: expect.stringMatching(/\.m4a$/) }),
    );
    // Signing content-length makes S3 refuse an upload whose size differs from what was declared.
    expect(options.signableHeaders).toEqual(new Set(['content-length']));
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', inputType: 'audio', status: 'uploading' }),
    );
  });

  it('creates picture meals with a .jpg key', async () => {
    // Act
    await CreateMealController.handle(buildRequest({ fileType: 'image/jpeg', fileSize: 3 * MEGABYTE }));

    // Assert
    const [, command] = mocks.getSignedUrl.mock.calls[0];
    expect(command.input.Key).toMatch(/\.jpg$/);
    expect(mocks.values).toHaveBeenCalledWith(expect.objectContaining({ inputType: 'picture' }));
  });

  it('rejects audio larger than the audio cap without creating a meal or an upload URL', async () => {
    // Act
    const response = await CreateMealController.handle(
      buildRequest({ fileType: 'audio/m4a', fileSize: 5 * MEGABYTE + 1 }),
    );

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'File too large.', maxBytes: 5 * MEGABYTE });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects pictures larger than the picture cap', async () => {
    // Act
    const response = await CreateMealController.handle(
      buildRequest({ fileType: 'image/jpeg', fileSize: 8 * MEGABYTE + 1 }),
    );

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'File too large.', maxBytes: 8 * MEGABYTE });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the cap', async () => {
    // Act
    const response = await CreateMealController.handle(
      buildRequest({ fileType: 'image/jpeg', fileSize: 8 * MEGABYTE }),
    );

    // Assert
    expect(response.statusCode).toBe(201);
  });

  it('honors a cap configured through the environment', async () => {
    // Arrange
    vi.stubEnv('MAX_AUDIO_FILE_BYTES', '1000');

    // Act
    const response = await CreateMealController.handle(buildRequest({ fileType: 'audio/m4a', fileSize: 1001 }));

    // Assert
    expect(response.statusCode).toBe(400);
    expect(response.body).toEqual({ error: 'File too large.', maxBytes: 1000 });
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -5],
    ['fractional', 10.5],
    ['a string', '1000'],
  ])('rejects a request whose fileSize is %s', async (_label, fileSize) => {
    // Act
    const response = await CreateMealController.handle(buildRequest({ fileType: 'audio/m4a', fileSize }));

    // Assert
    expect(response.statusCode).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  describe('consent', () => {
    it.each([
      ['never answered', undefined],
      ['withdrawn', { version: CURRENT_CONSENT_VERSION, status: 'withdrawn' }],
      ['given for an older version of the text', { version: 'old-version', status: 'accepted' }],
    ])('blocks the meal when consent was %s', async (_label, consent) => {
      // Arrange
      mocks.findConsent.mockResolvedValue(consent);

      // Act
      const response = await CreateMealController.handle(
        buildRequest({ fileType: 'audio/m4a', fileSize: 1000 }),
      );

      // Assert
      expect(response.statusCode).toBe(403);
      expect(response.body).toEqual({ error: 'consent_required', version: CURRENT_CONSENT_VERSION });
      expect(mocks.insert).not.toHaveBeenCalled();
      expect(mocks.getSignedUrl).not.toHaveBeenCalled();
    });

    it('validates the request before looking up consent', async () => {
      // Act
      const response = await CreateMealController.handle(buildRequest({ fileType: 'video/mp4', fileSize: 1000 }));

      // Assert
      expect(response.statusCode).toBe(400);
      expect(mocks.findConsent).not.toHaveBeenCalled();
    });
  });

  it('rejects an unsupported file type', async () => {
    // Act
    const response = await CreateMealController.handle(buildRequest({ fileType: 'video/mp4', fileSize: 1000 }));

    // Assert
    expect(response.statusCode).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
