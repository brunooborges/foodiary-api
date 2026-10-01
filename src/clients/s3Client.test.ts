import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { s3Client } from './s3Client';

// Presigning is computed locally (no network), so the real client can be used with throwaway credentials.
describe('s3Client presigned uploads', () => {
  beforeEach(() => {
    vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-access-key-id');
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-access-key');
    vi.stubEnv('AWS_REGION', 'us-east-1');
  });

  async function presignUpload() {
    const command = new PutObjectCommand({ Bucket: 'test-bucket', Key: 'file.m4a', ContentLength: 1234 });
    const url = await getSignedUrl(s3Client, command, {
      expiresIn: 600,
      signableHeaders: new Set(['content-length']),
    });

    return new URL(url);
  }

  it('does not bake a body checksum into the URL, which the app could never satisfy when it uploads the file', async () => {
    // Act
    const url = await presignUpload();

    // Assert
    const names = [...url.searchParams.keys()].map((name) => name.toLowerCase());
    expect(names.filter((name) => name.includes('checksum'))).toEqual([]);
  });

  it('signs the content length so S3 refuses a file of a different size', async () => {
    // Act
    const url = await presignUpload();

    // Assert
    expect(url.searchParams.get('X-Amz-SignedHeaders')).toContain('content-length');
  });
});
