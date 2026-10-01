import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { createOpenRouterProvider } from './openrouterProvider';

const mealJson = JSON.stringify({
  name: 'Café da manhã',
  icon: '☕',
  foods: [{ name: 'Pão francês', quantity: '50g', calories: 150, carbohydrates: 29, proteins: 4.5, fats: 1.5 }],
});

const options = { model: 'openai/gpt-4.1-mini', audioModel: 'google/gemini-2.5-flash' };

function createFakeClient(content: string | null = mealJson) {
  const chatCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const transcriptionsCreate = vi.fn();

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
      const { client } = createFakeClient(`\`\`\`json\n${mealJson}\n\`\`\``);
      const provider = createOpenRouterProvider(client, options);

      // Act
      const details = await provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() });

      // Assert
      expect(details.icon).toBe('☕');
    });

    it('throws when the model returns no content', async () => {
      // Arrange
      const { client } = createFakeClient(null);
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
    it('sends the audio as base64 input_audio to the audio model, never to /audio/transcriptions', async () => {
      // Arrange
      const { client, chatCreate, transcriptionsCreate } = createFakeClient('  eu comi pão com café  ');
      const provider = createOpenRouterProvider(client, options);
      const audio = Buffer.from('audio-bytes');

      // Act
      const transcription = await provider.transcribeAudio(audio);

      // Assert
      expect(transcription).toBe('eu comi pão com café');
      expect(transcriptionsCreate).not.toHaveBeenCalled();

      const request = chatCreate.mock.calls[0][0];
      expect(request.model).toBe('google/gemini-2.5-flash');

      const parts = request.messages[0].content;
      expect(parts).toContainEqual(expect.objectContaining({ type: 'text' }));
      expect(parts).toContainEqual({
        type: 'input_audio',
        input_audio: { data: audio.toString('base64'), format: 'm4a' },
      });
    });

    it('opts out of upstream providers that store or train on the audio', async () => {
      // Arrange
      const { client, chatCreate } = createFakeClient('transcrição');
      const provider = createOpenRouterProvider(client, options);

      // Act
      await provider.transcribeAudio(Buffer.from('audio-bytes'));

      // Assert
      expect(chatCreate.mock.calls[0][0].provider).toEqual({ data_collection: 'deny' });
    });

    it('throws when the audio model returns an empty transcription', async () => {
      // Arrange
      const { client } = createFakeClient('   ');
      const provider = createOpenRouterProvider(client, options);

      // Act & Assert
      await expect(provider.transcribeAudio(Buffer.from('audio-bytes'))).rejects.toThrow(
        'Failed to transcribe audio',
      );
    });
  });
});
