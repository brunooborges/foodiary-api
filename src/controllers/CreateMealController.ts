import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import z from 'zod';

import { s3Client } from '../clients/s3Client';
import { db } from '../db';
import { mealsTable } from '../db/schema';
import { CURRENT_CONSENT_VERSION, hasValidConsent } from '../lib/consent';
import { getMaxFileBytes } from '../lib/uploadLimits';
import { HttpResponse, ProtectedHttpRequest } from '../types/Http';
import { badRequest, created, forbidden } from '../utils/http';

const schema = z.object({
  fileType: z.enum(['audio/m4a', 'image/jpeg']),
  fileSize: z.number().int().positive(),
});

export class CreateMealController {
  static async handle({ userId, body }: ProtectedHttpRequest): Promise<HttpResponse> {
    const { success, error, data } = schema.safeParse(body);

    if (!success) {
      return badRequest({ errors: error.issues });
    }

    const isAudio = data.fileType === 'audio/m4a';
    const inputType = isAudio ? 'audio' : 'picture';
    const maxBytes = getMaxFileBytes(inputType);

    if (data.fileSize > maxBytes) {
      return badRequest({ error: 'File too large.', maxBytes });
    }

    // Photos and voice notes are sent to a third-party AI provider, which requires the user's consent.
    if (!(await hasValidConsent(userId))) {
      return forbidden({ error: 'consent_required', version: CURRENT_CONSENT_VERSION });
    }

    const fileId = randomUUID();
    const ext = isAudio ? '.m4a' : '.jpg';
    const fileKey = `${fileId}${ext}`;

    const command = new PutObjectCommand({
      Bucket: process.env.BUCKET_NAME,
      Key: fileKey,
      ContentLength: data.fileSize,
    });

    // Signing content-length makes S3 reject an upload whose size differs from the one validated above.
    const presignedURL = await getSignedUrl(s3Client, command, {
      expiresIn: 600,
      signableHeaders: new Set(['content-length']),
    });

    const [meal] = await db
      .insert(mealsTable)
      .values({
        userId,
        inputFileKey: fileKey,
        inputType,
        status: 'uploading',
        icon: '',
        name: '',
        foods: [],
      })
      .returning({ id: mealsTable.id });

    return created({
      mealId: meal.id,
      uploadURL: presignedURL,
    });
  }
}
