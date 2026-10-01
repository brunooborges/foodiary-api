import type OpenAI from 'openai';
import { toFile } from 'openai';

import { requestMealDetailsFromImage, requestMealDetailsFromText } from './chatMealDetails';
import { AiProvider } from './types';

const OPENAI_CHAT_MODEL = 'gpt-4.1-mini';
const OPENAI_TRANSCRIPTION_MODEL = 'whisper-1';

export function createOpenAiProvider(client: OpenAI): AiProvider {
  const chatOptions = { model: OPENAI_CHAT_MODEL };

  return {
    async transcribeAudio(fileBuffer) {
      const transcription = await client.audio.transcriptions.create({
        model: OPENAI_TRANSCRIPTION_MODEL,
        language: 'pt',
        response_format: 'text',
        file: await toFile(fileBuffer, 'audio.m4a', { type: 'audio/m4a' }),
      });

      return transcription;
    },

    getMealDetailsFromText: (params) => requestMealDetailsFromText(client, chatOptions, params),

    getMealDetailsFromImage: (params) => requestMealDetailsFromImage(client, chatOptions, params),
  };
}
