import type OpenAI from 'openai';
import { toFile } from 'openai';

import { requestMealDetailsFromImage, requestMealDetailsFromText } from './chatMealDetails';
import { AiProvider } from './types';

export type DataCollection = 'allow' | 'deny';

export type OpenRouterProviderOptions = {
  // Chat model that analyses meal text and photos.
  model: string;
  // Speech-to-text model for voice notes (e.g. openai/whisper-1). Chat models cannot be used here.
  audioModel: string;
  // "deny" unless explicitly relaxed (see OPENROUTER_DATA_COLLECTION); "allow" is meant for testing only.
  dataCollection?: DataCollection;
};

export function createOpenRouterProvider(
  client: OpenAI,
  { model, audioModel, dataCollection = 'deny' }: OpenRouterProviderOptions,
): AiProvider {
  // OpenRouter may route a request to any upstream provider; some of them store or train on prompts.
  // Meal photos are personal health data, so by default only providers that do not collect data are eligible.
  // If none qualifies for a model, OpenRouter answers 404. This preference does NOT apply to transcription:
  // OpenRouter does not honor routing preferences on its transcription endpoint.
  const privacyPreferences = { provider: { data_collection: dataCollection } };

  // Not every model honors response_format; the JSON is validated by parseMealDetails either way.
  const chatOptions = {
    model,
    responseFormat: { type: 'json_object' } as const,
    extraBody: privacyPreferences,
  };

  return {
    // Voice notes use OpenRouter's OpenAI-compatible transcription endpoint (/audio/transcriptions).
    async transcribeAudio(fileBuffer) {
      const result = await client.audio.transcriptions.create({
        model: audioModel,
        language: 'pt',
        file: await toFile(fileBuffer, 'audio.m4a', { type: 'audio/m4a' }),
      });

      const transcription = result.text?.trim();

      if (!transcription) {
        throw new Error('Failed to transcribe audio: the model returned no content.');
      }

      return transcription;
    },

    getMealDetailsFromText: (params) => requestMealDetailsFromText(client, chatOptions, params),

    getMealDetailsFromImage: (params) => requestMealDetailsFromImage(client, chatOptions, params),
  };
}
