import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq } from 'drizzle-orm';
import { Readable } from 'node:stream';
import { s3Client } from '../clients/s3Client';
import { db } from '../db';
import { mealsTable, userSettingsTable } from '../db/schema';
import { hasValidConsent } from '../lib/consent';
import { getMaxFileBytes, UploadInputType } from '../lib/uploadLimits';
import { getAiProvider, MealDetails, resolveProviderName } from '../services/ai';
import { describeError } from '../utils/describeError';

class ConsentRequiredError extends Error {
  constructor() {
    super('The user has no valid consent for AI processing.');
    this.name = 'ConsentRequiredError';
  }
}

class UploadedFileError extends Error {
  constructor() {
    super('The uploaded file has no valid size or exceeds the allowed size.');
    this.name = 'UploadedFileError';
  }
}

export class ProcessMeal {
  static async process({ fileKey }: { fileKey: string }) {
    const meal = await db.query.mealsTable.findFirst({
      where: eq(mealsTable.inputFileKey, fileKey),
    });

    if (!meal) {
      throw new Error('Meal not found.');
    }

    if (meal.status === 'failed' || meal.status === 'success') {
      return;
    }

    // Claiming is a single conditional update: S3 events are delivered at least once and an upload URL can be replayed,
    // so only the worker that flips "uploading" to "processing" may call the (paid) AI providers.
    const [claimedMeal] = await db
      .update(mealsTable)
      .set({ status: 'processing' })
      .where(and(eq(mealsTable.id, meal.id), eq(mealsTable.status, 'uploading')))
      .returning({ id: mealsTable.id });

    if (!claimedMeal) {
      return;
    }

    try {
      // Consent can be withdrawn between the upload and the processing, so it is checked again here.
      if (!(await hasValidConsent(meal.userId))) {
        throw new ConsentRequiredError();
      }

      await this.assertFileWithinLimit(meal.inputFileKey, meal.inputType);

      const savedProvider = await this.findSavedAiProvider(meal.userId);
      const ai = getAiProvider(resolveProviderName(savedProvider));

      let icon = '';
      let name = '';
      let foods: MealDetails['foods'] = [];
      if (meal.inputType === 'audio') {
        const audioFileBuffer = await this.downloadAudioFile(meal.inputFileKey);
        const transcription = await ai.transcribeAudio(audioFileBuffer);

        const mealDetails = await ai.getMealDetailsFromText({
          createdAt: new Date(),
          text: transcription,
        });

        icon = mealDetails.icon;
        name = mealDetails.name;
        foods = mealDetails.foods;
      }

      if (meal.inputType === 'picture') {
        const imageURL = await this.getImageURL(meal.inputFileKey);
        const mealDetails = await ai.getMealDetailsFromImage({
          createdAt: meal.createdAt,
          imageURL: imageURL,
        });

        icon = mealDetails.icon;
        name = mealDetails.name;
        foods = mealDetails.foods;
      }

      await db
        .update(mealsTable)
        .set({
          status: 'success',
          name,
          icon,
          foods,
        })
        .where(eq(mealsTable.id, meal.id));
    } catch (error) {
      console.error('Failed to process meal.', { mealId: meal.id, ...describeError(error) });
      await db.update(mealsTable).set({ status: 'failed' }).where(eq(mealsTable.id, meal.id));
    }
  }

  // The size declared when the upload was requested is signed into the URL, but the stored object is checked again
  // here so that nothing oversized ever reaches a paid AI provider.
  private static async assertFileWithinLimit(fileKey: string, inputType: UploadInputType) {
    const { ContentLength } = await s3Client.send(
      new HeadObjectCommand({ Bucket: process.env.BUCKET_NAME!, Key: fileKey }),
    );

    if (ContentLength === undefined || ContentLength > getMaxFileBytes(inputType)) {
      throw new UploadedFileError();
    }
  }

  // A problem reading the setting (e.g. table not migrated yet) must not fail meals of users on the default provider.
  private static async findSavedAiProvider(userId: string) {
    try {
      const settings = await db.query.userSettingsTable.findFirst({
        columns: { aiProvider: true },
        where: eq(userSettingsTable.userId, userId),
      });

      return settings?.aiProvider;
    } catch (error) {
      console.error('Failed to load the AI provider setting, using the default.', describeError(error));
      return undefined;
    }
  }

  private static async downloadAudioFile(fileKey: string) {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: fileKey,
    });

    const { Body } = await s3Client.send(command);

    if (!Body || !(Body instanceof Readable)) {
      throw new Error('Cannot load the audio file.');
    }

    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }

    return Buffer.concat(chunks);
  }
  private static async getImageURL(fileKey: string) {
    const command = new GetObjectCommand({
      Bucket: process.env.BUCKET_NAME!,
      Key: fileKey,
    });

    return getSignedUrl(s3Client, command, { expiresIn: 600 });
  }
}
