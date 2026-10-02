import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { createOpenRouterProvider } from './openrouterProvider';

const mealJson = JSON.stringify({
  name: 'Café da manhã',
  icon: '☕',
  foods: [{ name: 'Pão francês', quantity: '50g', calories: 150, carbohydrates: 29, proteins: 4.5, fats: 1.5 }],
});

const options = { model: 'openai/gpt-4.1-mini', audioModel: 'openai/whisper-large-v3' };

function createFakeClient({
  content = mealJson as string | null,
  transcription = { text: 'eu comi pão com café' } as { text?: string },
} = {}) {
  const chatCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const transcriptionsCreate = vi.fn().mockResolvedValue(transcription);

  const client = {
    chat: { completions: { create: chatCreate } },
    audio: { transcriptions: { create: transcriptionsCreate } },
  } as unknown as OpenAI;

  return { client, chatCreate, transcriptionsCreate };
}

describe('createOpenRouterProvider', () => {
  describe('getMealDetailsFromText', () => {
    it('uses the configured model and requests a JSON object', async () => {
      // Arrange
      const { client, chatCreate } = createFakeClient();
      const provider = createOpenRouterProvider(client, options);

      // Act
      const details = await provider.getMealDetailsFromText({ text: 'pão com café', createdAt: new Date() });

      // Assert
      expect(details.name).toBe('Café da manhã');
      const request = chatCreate.mock.calls[0][0];
      expect(request.model).toBe('openai/gpt-4.1-mini');
      expect(request.response_format).toEqual({ type: 'json_object' });
      expect(request.messages[1].content).toContain('pão com café');
    });

    it('accepts a response wrapped in a code fence, which some models add', async () => {
      // Arrange
      const { client } = createFakeClient({ content: `\`\`\`json\n${mealJson}\n\`\`\`` });
      const provider = createOpenRouterProvider(client, options);

      // Act
      const details = await provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() });

      // Assert
      expect(details.icon).toBe('☕');
    });

    it('throws when the model returns no content', async () => {
      // Arrange
      const { client } = createFakeClient({ content: null });
      const provider = createOpenRouterProvider(client, options);

      // Act & Assert
      await expect(provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() })).rejects.toThrow(
        'Failed to process meal',
      );
    });
  });

  it('opts out of upstream providers that store or train on meal text and photos', async () => {
    // Arrange
    const { client, chatCreate } = createFakeClient();
    const provider = createOpenRouterProvider(client, options);

    // Act
    await provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() });
    await provider.getMealDetailsFromImage({ imageURL: 'https://example.com/meal.jpg', createdAt: new Date() });

    // Assert
    expect(chatCreate.mock.calls[0][0].provider).toEqual({ data_collection: 'deny' });
    expect(chatCreate.mock.calls[1][0].provider).toEqual({ data_collection: 'deny' });
  });

  it('can be told to allow providers that collect data, for testing only, for meal text and photos', async () => {
    // Arrange
    const { client, chatCreate } = createFakeClient();
    const provider = createOpenRouterProvider(client, { ...options, dataCollection: 'allow' });

    // Act
    await provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() });
    await provider.getMealDetailsFromImage({ imageURL: 'https://example.com/meal.jpg', createdAt: new Date() });

    // Assert
    expect(chatCreate).toHaveBeenCalledTimes(2);
    for (const [request] of chatCreate.mock.calls) {
      expect(request.provider).toEqual({ data_collection: 'allow' });
    }
  });

  describe('getMealDetailsFromImage', () => {
    it('sends the image URL to the configured model', async () => {
      // Arrange
      const { client, chatCreate } = createFakeClient();
      const provider = createOpenRouterProvider(client, options);

      // Act
      await provider.getMealDetailsFromImage({ imageURL: 'https://example.com/meal.jpg', createdAt: new Date() });

      // Assert
      const request = chatCreate.mock.calls[0][0];
      expect(request.model).toBe('openai/gpt-4.1-mini');
      expect(request.response_format).toEqual({ type: 'json_object' });
      expect(request.messages[1].content).toEqual([
        { type: 'image_url', image_url: { url: 'https://example.com/meal.jpg' } },
      ]);
    });
  });

  describe('transcribeAudio', () => {
    it('uses the OpenRouter transcription endpoint with the configured speech-to-text model, in Portuguese', async () => {
      // Arrange
      const { client, chatCreate, transcriptionsCreate } = createFakeClient({
        transcription: { text: '  eu comi pão com café  ' },
      });
      const provider = createOpenRouterProvider(client, options);

      // Act
      const transcription = await provider.transcribeAudio(Buffer.from('audio-bytes'));

      // Assert
      expect(transcription).toBe('eu comi pão com café');
      expect(chatCreate).not.toHaveBeenCalled();

      const request = transcriptionsCreate.mock.calls[0][0];
      expect(request.model).toBe('openai/whisper-large-v3');
      expect(request.language).toBe('pt');
      expect(request.file.name).toBe('audio.m4a');
    });

    it('does not send chat-only options to the transcription endpoint', async () => {
      // Arrange
      const { client, transcriptionsCreate } = createFakeClient();
      const provider = createOpenRouterProvider(client, options);

      // Act
      await provider.transcribeAudio(Buffer.from('audio-bytes'));

      // Assert: routing preferences are not applied to transcription requests, so none are sent.
      const request = transcriptionsCreate.mock.calls[0][0];
      expect(request).not.toHaveProperty('provider');
      expect(request).not.toHaveProperty('messages');
      expect(request).not.toHaveProperty('response_format');
    });

    it.each([
      ['empty', { text: '   ' }],
      ['missing', {}],
    ])('throws when the transcription is %s', async (_label, transcription) => {
      // Arrange
      const { client } = createFakeClient({ transcription });
      const provider = createOpenRouterProvider(client, options);

      // Act & Assert
      await expect(provider.transcribeAudio(Buffer.from('audio-bytes'))).rejects.toThrow(
        'Failed to transcribe audio',
      );
    });
  });
});
