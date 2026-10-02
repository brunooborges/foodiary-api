import { HeadObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const where = vi.fn();
  const returning = vi.fn();
  const set = vi.fn(() => ({ where }));

  return {
    where,
    returning,
    set,
    update: vi.fn(() => ({ set })),
    mealFindFirst: vi.fn(),
    settingsFindFirst: vi.fn(),
    s3Send: vi.fn(),
    getSignedUrl: vi.fn(),
    getAiProvider: vi.fn(),
    consentFindFirst: vi.fn(),
  };
});

vi.mock('../db', () => ({
  db: {
    query: {
      mealsTable: { findFirst: mocks.mealFindFirst },
      userSettingsTable: { findFirst: mocks.settingsFindFirst },
      userConsentsTable: { findFirst: mocks.consentFindFirst },
    },
    update: mocks.update,
  },
}));
vi.mock('../clients/s3Client', () => ({ s3Client: { send: mocks.s3Send } }));
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: mocks.getSignedUrl }));
vi.mock('../services/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/ai')>()),
  getAiProvider: mocks.getAiProvider,
}));

import { CURRENT_CONSENT_VERSION } from '../lib/consent';
import { ProcessMeal } from './ProcessMeal';

const mealDetails = {
  name: 'Jantar',
  icon: '🍗',
  foods: [{ name: 'Arroz', quantity: '150g', calories: 193, carbohydrates: 42, proteins: 3.5, fats: 0.4 }],
};

function buildMeal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'meal-1',
    userId: 'user-1',
    status: 'uploading',
    inputType: 'picture',
    inputFileKey: 'file.jpg',
    createdAt: new Date('2025-01-15T19:00:00Z'),
    ...overrides,
  };
}

// HeadObject reports the stored size; GetObject returns the audio bytes.
function mockStoredFile({ size }: { size: number | undefined }) {
  mocks.s3Send.mockImplementation(async (command: unknown) =>
    command instanceof HeadObjectCommand
      ? { ContentLength: size }
      : { Body: Readable.from([Buffer.from('audio-bytes')]) },
  );
}

function buildProvider() {
  return {
    transcribeAudio: vi.fn().mockResolvedValue('eu comi arroz'),
    getMealDetailsFromText: vi.fn().mockResolvedValue(mealDetails),
    getMealDetailsFromImage: vi.fn().mockResolvedValue(mealDetails),
  };
}

describe('ProcessMeal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // `update().set().where()` is awaited directly for plain updates and chained with `.returning()` when claiming.
    mocks.where.mockImplementation(() => Object.assign(Promise.resolve(undefined), { returning: mocks.returning }));
    mocks.returning.mockResolvedValue([{ id: 'meal-1' }]);
    mocks.settingsFindFirst.mockResolvedValue({ aiProvider: 'openrouter' });
    mocks.consentFindFirst.mockResolvedValue({ version: CURRENT_CONSENT_VERSION, status: 'accepted' });
    mocks.getSignedUrl.mockResolvedValue('https://bucket.example/file.jpg?sig=1');
    mockStoredFile({ size: 1024 });
    vi.stubEnv('AI_DEFAULT_PROVIDER', '');
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('analyses a picture with the provider chosen by the user', async () => {
    // Arrange
    const provider = buildProvider();
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockReturnValue(provider);

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.getAiProvider).toHaveBeenCalledWith('openrouter');
    expect(provider.getMealDetailsFromImage).toHaveBeenCalledWith({
      imageURL: 'https://bucket.example/file.jpg?sig=1',
      createdAt: new Date('2025-01-15T19:00:00Z'),
    });
    expect(mocks.set).toHaveBeenLastCalledWith({
      status: 'success',
      name: 'Jantar',
      icon: '🍗',
      foods: mealDetails.foods,
    });
  });

  it('transcribes an audio meal and analyses the transcription with the chosen provider', async () => {
    // Arrange
    const provider = buildProvider();
    mocks.mealFindFirst.mockResolvedValue(buildMeal({ inputType: 'audio', inputFileKey: 'file.m4a' }));
    mocks.getAiProvider.mockReturnValue(provider);

    // Act
    await ProcessMeal.process({ fileKey: 'file.m4a' });

    // Assert
    expect(mocks.getAiProvider).toHaveBeenCalledWith('openrouter');
    expect(provider.transcribeAudio).toHaveBeenCalledWith(Buffer.from('audio-bytes'));
    expect(provider.getMealDetailsFromText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'eu comi arroz' }),
    );
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'success', name: 'Jantar' }));
  });

  it('still processes the meal with the default provider when the settings lookup fails', async () => {
    // Arrange
    const provider = buildProvider();
    mocks.settingsFindFirst.mockRejectedValue(new Error('relation "user_settings" does not exist'));
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockReturnValue(provider);

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.getAiProvider).toHaveBeenCalledWith('openai');
    expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('marks the meal as processing before calling the provider', async () => {
    // Arrange
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockReturnValue(buildProvider());

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.set).toHaveBeenNthCalledWith(1, { status: 'processing' });
  });

  it('falls back to openai when the user has no saved setting', async () => {
    // Arrange
    mocks.settingsFindFirst.mockResolvedValue(undefined);
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockReturnValue(buildProvider());

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.getAiProvider).toHaveBeenCalledWith('openai');
  });

  it('marks the meal as failed when the provider throws', async () => {
    // Arrange
    const provider = buildProvider();
    provider.getMealDetailsFromImage.mockRejectedValue(new Error('boom'));
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockReturnValue(provider);

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.set).toHaveBeenLastCalledWith({ status: 'failed' });
  });

  it('logs a failure without leaking presigned URLs or upstream response details', async () => {
    // Arrange
    const leakyMessage = 'could not fetch https://bucket.s3.amazonaws.com/file.jpg?X-Amz-Signature=topsecret';
    const leakyError = OpenAI.APIError.generate(
      404,
      { error: { message: leakyMessage, code: 'provider_error', raw: 'user content echoed back' } },
      leakyMessage,
      new Headers({ 'x-request-id': 'req-123' }),
    );
    const provider = buildProvider();
    provider.getMealDetailsFromImage.mockRejectedValue(leakyError);
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockReturnValue(provider);

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    const logged = JSON.stringify([
      vi.mocked(console.error).mock.calls,
      vi.mocked(console.log).mock.calls,
    ]);
    expect(logged).toContain('meal-1');
    expect(logged).toContain('"provider":"openrouter"');
    expect(logged).toContain('404');
    expect(logged).toContain('req-123');
    expect(logged).toContain('could not fetch [url]');
    expect(logged).not.toContain('X-Amz-Signature');
    expect(logged).not.toContain('topsecret');
    expect(logged).not.toContain('user content echoed back');
  });

  describe('user consent', () => {
    it.each([
      ['was never given', undefined],
      ['was withdrawn after the upload', { version: CURRENT_CONSENT_VERSION, status: 'withdrawn' }],
    ])('fails the meal without touching the file or any AI provider when consent %s', async (_label, consent) => {
      // Arrange
      mocks.consentFindFirst.mockResolvedValue(consent);
      mocks.mealFindFirst.mockResolvedValue(buildMeal());

      // Act
      await ProcessMeal.process({ fileKey: 'file.jpg' });

      // Assert
      expect(mocks.s3Send).not.toHaveBeenCalled();
      expect(mocks.getSignedUrl).not.toHaveBeenCalled();
      expect(mocks.getAiProvider).not.toHaveBeenCalled();
      expect(mocks.set).toHaveBeenLastCalledWith({ status: 'failed' });
    });

    it('fails the meal when consent cannot be verified', async () => {
      // Arrange
      mocks.consentFindFirst.mockRejectedValue(new Error('db unavailable'));
      mocks.mealFindFirst.mockResolvedValue(buildMeal());

      // Act
      await ProcessMeal.process({ fileKey: 'file.jpg' });

      // Assert
      expect(mocks.getAiProvider).not.toHaveBeenCalled();
      expect(mocks.set).toHaveBeenLastCalledWith({ status: 'failed' });
    });
  });

  describe('uploaded file size', () => {
    const MEGABYTE = 1024 * 1024;

    it.each([
      ['audio', 'file.m4a', 5 * MEGABYTE + 1],
      ['picture', 'file.jpg', 8 * MEGABYTE + 1],
    ])('fails an oversized %s without downloading it or calling any AI provider', async (inputType, fileKey, size) => {
      // Arrange
      mocks.mealFindFirst.mockResolvedValue(buildMeal({ inputType, inputFileKey: fileKey }));
      mockStoredFile({ size });

      // Act
      await ProcessMeal.process({ fileKey });

      // Assert
      expect(mocks.getAiProvider).not.toHaveBeenCalled();
      expect(mocks.getSignedUrl).not.toHaveBeenCalled();
      expect(mocks.s3Send).toHaveBeenCalledTimes(1);
      expect(mocks.s3Send.mock.calls[0][0]).toBeInstanceOf(HeadObjectCommand);
      expect(mocks.set).toHaveBeenLastCalledWith({ status: 'failed' });
    });

    it('fails the meal when the stored size cannot be determined', async () => {
      // Arrange
      mocks.mealFindFirst.mockResolvedValue(buildMeal());
      mockStoredFile({ size: undefined });

      // Act
      await ProcessMeal.process({ fileKey: 'file.jpg' });

      // Assert
      expect(mocks.getAiProvider).not.toHaveBeenCalled();
      expect(mocks.set).toHaveBeenLastCalledWith({ status: 'failed' });
    });

    it('processes a file that is exactly at the cap', async () => {
      // Arrange
      mocks.mealFindFirst.mockResolvedValue(buildMeal());
      mocks.getAiProvider.mockReturnValue(buildProvider());
      mockStoredFile({ size: 8 * MEGABYTE });

      // Act
      await ProcessMeal.process({ fileKey: 'file.jpg' });

      // Assert
      expect(mocks.set).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'success' }));
    });
  });

  it('does not name a provider in the log when the failure happened before one was chosen', async () => {
    // Arrange
    mocks.consentFindFirst.mockResolvedValue(undefined);
    mocks.mealFindFirst.mockResolvedValue(buildMeal());

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    const [, details] = vi.mocked(console.error).mock.calls[0];
    expect(details).toMatchObject({ mealId: 'meal-1', name: 'ConsentRequiredError' });
    expect(details).not.toHaveProperty('provider');
  });

  it('marks the meal as failed when the chosen provider is not configured', async () => {
    // Arrange
    mocks.mealFindFirst.mockResolvedValue(buildMeal());
    mocks.getAiProvider.mockImplementation(() => {
      throw new Error('openrouter is not configured');
    });

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.set).toHaveBeenLastCalledWith({ status: 'failed' });
  });

  it('does nothing when another worker already claimed the meal, so the AI is never called twice', async () => {
    // Arrange: the conditional update ("only if still uploading") matched no row.
    mocks.returning.mockResolvedValue([]);
    mocks.mealFindFirst.mockResolvedValue(buildMeal());

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith({ status: 'processing' });
    expect(mocks.s3Send).not.toHaveBeenCalled();
    expect(mocks.getAiProvider).not.toHaveBeenCalled();
  });

  it('does nothing for a meal that was already processed', async () => {
    // Arrange
    mocks.mealFindFirst.mockResolvedValue(buildMeal({ status: 'success' }));

    // Act
    await ProcessMeal.process({ fileKey: 'file.jpg' });

    // Assert
    expect(mocks.getAiProvider).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it('throws when the meal does not exist', async () => {
    // Arrange
    mocks.mealFindFirst.mockResolvedValue(undefined);

    // Act & Assert
    await expect(ProcessMeal.process({ fileKey: 'missing.jpg' })).rejects.toThrow('Meal not found.');
  });
});
