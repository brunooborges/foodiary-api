import { beforeEach, describe, expect, it, vi } from 'vitest';

const openAiConstructor = vi.fn();
const clients = vi.hoisted(() => [] as { audio: { transcriptions: { create: ReturnType<typeof vi.fn> } } }[]);

vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: vi.fn() } };
    audio = { transcriptions: { create: vi.fn().mockResolvedValue({ text: 'olá' }) } };

    constructor(options: unknown) {
      openAiConstructor(options);
      clients.push(this);
    }
  },
  toFile: vi.fn(),
}));

import { getAiProvider, isProviderConfigured, resolveDataCollection, resolveProviderName } from './index';

describe('ai provider factory', () => {
  beforeEach(() => {
    openAiConstructor.mockClear();
  });

  it('does not build any API client when the module is imported', async () => {
    // Arrange
    vi.resetModules();
    openAiConstructor.mockClear();

    // Act: a missing key must never crash startup of an OpenRouter-only deployment.
    await import('./index');

    // Assert
    expect(openAiConstructor).not.toHaveBeenCalled();
  });

  it('bounds every API call so a slow provider fails inside the worker instead of hanging it', () => {
    // Act
    getAiProvider('openai', { OPENAI_API_KEY: 'sk-test' });
    getAiProvider('openrouter', { OPENROUTER_API_KEY: 'or-test' });

    // Assert
    for (const [options] of openAiConstructor.mock.calls) {
      expect(options).toEqual(expect.objectContaining({ timeout: 20_000, maxRetries: 1 }));
    }
  });

  describe('resolveProviderName', () => {
    it('prefers the user setting', () => {
      expect(resolveProviderName('openrouter', { AI_DEFAULT_PROVIDER: 'openai' })).toBe('openrouter');
    });

    it('falls back to AI_DEFAULT_PROVIDER when the user has no setting', () => {
      expect(resolveProviderName(undefined, { AI_DEFAULT_PROVIDER: 'openrouter' })).toBe('openrouter');
      expect(resolveProviderName(null, { AI_DEFAULT_PROVIDER: 'openrouter' })).toBe('openrouter');
    });

    it('falls back to openai when nothing valid is configured', () => {
      expect(resolveProviderName(undefined, {})).toBe('openai');
      expect(resolveProviderName('gemini', { AI_DEFAULT_PROVIDER: 'nope' })).toBe('openai');
    });
  });

  describe('resolveDataCollection', () => {
    it('denies data collection by default', () => {
      expect(resolveDataCollection({})).toBe('deny');
      expect(resolveDataCollection({ OPENROUTER_DATA_COLLECTION: '' })).toBe('deny');
    });

    it('allows it only when explicitly set to allow', () => {
      expect(resolveDataCollection({ OPENROUTER_DATA_COLLECTION: 'allow' })).toBe('allow');
      expect(resolveDataCollection({ OPENROUTER_DATA_COLLECTION: ' Allow ' })).toBe('allow');
    });

    it('keeps denying for any other value, so a typo never loosens the privacy setting', () => {
      for (const value of ['deny', 'true', '1', 'yes', 'allow-all', 'allowed']) {
        expect(resolveDataCollection({ OPENROUTER_DATA_COLLECTION: value })).toBe('deny');
      }
    });
  });

  describe('isProviderConfigured', () => {
    it('requires the matching API key', () => {
      expect(isProviderConfigured('openai', { OPENAI_API_KEY: 'sk-test' })).toBe(true);
      expect(isProviderConfigured('openai', { OPENROUTER_API_KEY: 'or-test' })).toBe(false);
      expect(isProviderConfigured('openrouter', { OPENROUTER_API_KEY: 'or-test' })).toBe(true);
      expect(isProviderConfigured('openrouter', { OPENAI_API_KEY: 'sk-test' })).toBe(false);
    });

    it('treats an empty key as not configured', () => {
      expect(isProviderConfigured('openai', { OPENAI_API_KEY: '' })).toBe(false);
      expect(isProviderConfigured('openrouter', { OPENROUTER_API_KEY: '' })).toBe(false);
    });
  });

  describe('getAiProvider', () => {
    it('builds the OpenRouter client against the OpenRouter API with its own key', () => {
      // Act
      getAiProvider('openrouter', { OPENROUTER_API_KEY: 'or-test' });

      // Assert
      expect(openAiConstructor).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://openrouter.ai/api/v1', apiKey: 'or-test' }),
      );
    });

    it('builds the OpenAI client with its own key and no custom base URL', () => {
      // Act
      getAiProvider('openai', { OPENAI_API_KEY: 'sk-test' });

      // Assert
      expect(openAiConstructor).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'sk-test' }));
      expect(openAiConstructor.mock.calls[0][0]).not.toHaveProperty('baseURL');
    });

    it('throws a clear error when the provider is not configured', () => {
      expect(() => getAiProvider('openrouter', {})).toThrow('openrouter is not configured');
      expect(() => getAiProvider('openai', { OPENAI_API_KEY: '' })).toThrow('openai is not configured');
      expect(openAiConstructor).not.toHaveBeenCalled();
    });

    it('defaults to a speech-to-text model for OpenRouter voice notes, since chat models cannot transcribe', async () => {
      // Act
      const provider = getAiProvider('openrouter', { OPENROUTER_API_KEY: 'or-test' });
      await provider.transcribeAudio(Buffer.from('audio-bytes'));

      // Assert
      const client = clients[clients.length - 1];
      expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'openai/whisper-1' }),
      );
    });

    it('uses the speech-to-text model configured for OpenRouter', async () => {
      // Act
      const provider = getAiProvider('openrouter', {
        OPENROUTER_API_KEY: 'or-test',
        OPENROUTER_AUDIO_MODEL: 'openai/whisper-large-v3',
      });
      await provider.transcribeAudio(Buffer.from('audio-bytes'));

      // Assert
      const client = clients[clients.length - 1];
      expect(client.audio.transcriptions.create).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'openai/whisper-large-v3' }),
      );
    });

    it('returns a provider exposing the three meal operations', () => {
      // Act
      const provider = getAiProvider('openrouter', { OPENROUTER_API_KEY: 'or-test' });

      // Assert
      expect(provider.transcribeAudio).toBeTypeOf('function');
      expect(provider.getMealDetailsFromText).toBeTypeOf('function');
      expect(provider.getMealDetailsFromImage).toBeTypeOf('function');
    });
  });
});
