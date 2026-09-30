import type OpenAI from 'openai';

import { requestMealDetailsFromImage, requestMealDetailsFromText } from './chatMealDetails';
import { AiProvider } from './types';

export type OpenRouterProviderOptions = {
  model: string;
  audioModel: string;
};

const TRANSCRIPTION_PROMPT =
  'Transcreva fielmente o áudio a seguir, que está em português do Brasil. Responda apenas com a transcrição, sem comentários.';

// OpenRouter may route a request to any upstream provider; some of them store or train on prompts.
// Meal photos and voice notes are personal health data, so only providers that do not collect data are eligible.
const PRIVACY_PREFERENCES = { provider: { data_collection: 'deny' } };

export function createOpenRouterProvider(
  client: OpenAI,
  { model, audioModel }: OpenRouterProviderOptions,
): AiProvider {
  // Not every model honors response_format; the JSON is validated by parseMealDetails either way.
  const chatOptions = {
    model,
    responseFormat: { type: 'json_object' } as const,
    extraBody: PRIVACY_PREFERENCES,
  };

  return {
    // OpenRouter has no /audio/transcriptions endpoint: audio goes through chat completions
    // as base64 input_audio, handled by an audio-capable model.
    async transcribeAudio(fileBuffer) {
      // The SDK types only allow 'wav' | 'mp3' for input_audio.format, but OpenRouter accepts m4a.
      const audioPart = {
        type: 'input_audio',
        input_audio: { data: fileBuffer.toString('base64'), format: 'm4a' },
      } as unknown as OpenAI.Chat.Completions.ChatCompletionContentPart;

      const response = await client.chat.completions.create({
        model: audioModel,
        ...PRIVACY_PREFERENCES,
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', text: TRANSCRIPTION_PROMPT }, audioPart],
          },
        ],
      });

      const transcription = response.choices[0]?.message.content?.trim();

      if (!transcription) {
        throw new Error('Failed to transcribe audio: the model returned no content.');
      }

      return transcription;
    },

    getMealDetailsFromText: (params) => requestMealDetailsFromText(client, chatOptions, params),

    getMealDetailsFromImage: (params) => requestMealDetailsFromImage(client, chatOptions, params),
  };
}
