import { S3Client } from '@aws-sdk/client-s3';

// Recent SDK versions compute a CRC32 checksum by default and, for presigned PutObject URLs, bake the checksum of an
// empty body into the URL. The app uploads the real file later, so S3 would reject it. Only compute checksums when
// an operation requires them.
export const s3Client = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' });
