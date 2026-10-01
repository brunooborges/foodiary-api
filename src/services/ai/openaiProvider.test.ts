import type OpenAI from 'openai';
import { describe, expect, it, vi } from 'vitest';

import { createOpenAiProvider } from './openaiProvider';

const mealJson = JSON.stringify({
  name: 'Almoço',
  icon: '🍛',
  foods: [{ name: 'Feijão', quantity: '100g', calories: 77, carbohydrates: 14, proteins: 4.5, fats: 0.5 }],
});

function createFakeClient({ content = mealJson, transcription = 'eu comi arroz e feijão' } = {}) {
  const chatCreate = vi.fn().mockResolvedValue({ choices: [{ message: { content } }] });
  const transcriptionsCreate = vi.fn().mockResolvedValue(transcription);

  const client = {
    chat: { completions: { create: chatCreate } },
    audio: { transcriptions: { create: transcriptionsCreate } },
  } as unknown as OpenAI;

  return { client, chatCreate, transcriptionsCreate };
}

describe('createOpenAiProvider', () => {
  describe('transcribeAudio', () => {
    it('transcribes the audio in Portuguese with whisper-1 as plain text', async () => {
      // Arrange
      const { client, transcriptionsCreate } = createFakeClient();
      const provider = createOpenAiProvider(client);

      // Act
      const transcription = await provider.transcribeAudio(Buffer.from('audio-bytes'));

      // Assert
      expect(transcription).toBe('eu comi arroz e feijão');
      expect(transcriptionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'whisper-1', language: 'pt', response_format: 'text' }),
      );
    });
  });

  describe('getMealDetailsFromText', () => {
    it('asks gpt-4.1-mini for the meal details and returns the parsed result', async () => {
      // Arrange
      const { client, chatCreate } = createFakeClient();
      const provider = createOpenAiProvider(client);
      const createdAt = new Date('2025-01-15T12:30:00Z');

      // Act
      const details = await provider.getMealDetailsFromText({ text: 'arroz e feijão', createdAt });

      // Assert
      expect(details.name).toBe('Almoço');
      const request = chatCreate.mock.calls[0][0];
      expect(request.model).toBe('gpt-4.1-mini');
      expect(request.messages[0].role).toBe('system');
      expect(request.messages[1].role).toBe('user');
      expect(request.messages[1].content).toContain('arroz e feijão');
      expect(request.messages[1].content).toContain(String(createdAt));
    });

    it('does not send OpenRouter-only routing options to OpenAI', async () => {
      // Arrange
      const { client, chatCreate } = createFakeClient();
      const provider = createOpenAiProvider(client);

      // Act
      await provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() });

      // Assert
      expect(chatCreate.mock.calls[0][0]).not.toHaveProperty('provider');
    });

    it('throws when the model returns no content', async () => {
      // Arrange
      const { client } = createFakeClient({ content: null as unknown as string });
      const provider = createOpenAiProvider(client);

      // Act & Assert
      await expect(provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() })).rejects.toThrow(
        'Failed to process meal',
      );
    });

    it('accepts a response wrapped in a code fence', async () => {
      // Arrange
      const { client } = createFakeClient({ content: `\`\`\`json\n${mealJson}\n\`\`\`` });
      const provider = createOpenAiProvider(client);

      // Act
      const details = await provider.getMealDetailsFromText({ text: 'x', createdAt: new Date() });

      // Assert
      expect(details.icon).toBe('🍛');
    });
  });

  describe('getMealDetailsFromImage', () => {
    it('sends the image URL to gpt-4.1-mini and returns the parsed result', async () => {
      // Arrange
      const { client, chatCreate } = createFakeClient();
      const provider = createOpenAiProvider(client);
      const createdAt = new Date('2025-01-15T19:00:00Z');

      // Act
      const details = await provider.getMealDetailsFromImage({
        imageURL: 'https://bucket.s3.amazonaws.com/meal.jpg?signature=abc',
        createdAt,
      });

      // Assert
      expect(details.foods).toHaveLength(1);
      const request = chatCreate.mock.calls[0][0];
      expect(request.model).toBe('gpt-4.1-mini');
      expect(request.messages[0].content).toContain(`Meal date: ${createdAt}`);
      expect(request.messages[1].content).toEqual([
        { type: 'image_url', image_url: { url: 'https://bucket.s3.amazonaws.com/meal.jpg?signature=abc' } },
      ]);
    });
  });
});
