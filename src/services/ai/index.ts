import OpenAI from 'openai';

import { AI_PROVIDER_NAMES, AiProviderName } from '../../types/AiProvider';
import { createOpenAiProvider } from './openaiProvider';
import { createOpenRouterProvider, DataCollection } from './openrouterProvider';
import { AiProvider } from './types';

export type { MealDetails } from './mealDetails';
export type { AiProvider } from './types';

type Env = Record<string, string | undefined>;

const DEFAULT_PROVIDER: AiProviderName = 'openai';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_APP_TITLE = 'Foodiary';
const DEFAULT_OPENROUTER_MODEL = 'openai/gpt-4.1-mini';
// Voice notes need a speech-to-text model: OpenRouter rejects those on chat completions and chat models are not
// accepted by its transcription endpoint.
const DEFAULT_OPENROUTER_AUDIO_MODEL = 'openai/whisper-1';

// The meal worker Lambda has a hard timeout (see serverless.yml). Failing fast inside the worker lets it
// mark the meal as failed instead of being killed mid-request and leaving it stuck in "processing".
// Worst case for a voice note: two sequential calls (transcription, then analysis), each with one retry:
// 2 x 2 x 20s = 80s, which fits the 90s Lambda timeout.
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

const API_KEY_VARIABLE: Record<AiProviderName, string> = {
  openai: 'OPENAI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

// Only the exact value "allow" relaxes the privacy setting; a typo or any other value keeps it on "deny".
export function resolveDataCollection(env: Env = process.env): DataCollection {
  return env.OPENROUTER_DATA_COLLECTION?.trim().toLowerCase() === 'allow' ? 'allow' : 'deny';
}

export function isAiProviderName(value: unknown): value is AiProviderName {
  return AI_PROVIDER_NAMES.some((name) => name === value);
}

export function isProviderConfigured(name: AiProviderName, env: Env = process.env): boolean {
  return Boolean(env[API_KEY_VARIABLE[name]]);
}

export function resolveProviderName(setting: string | null | undefined, env: Env = process.env): AiProviderName {
  if (isAiProviderName(setting)) {
    return setting;
  }

  if (isAiProviderName(env.AI_DEFAULT_PROVIDER)) {
    return env.AI_DEFAULT_PROVIDER;
  }

  return DEFAULT_PROVIDER;
}

// Clients are built on demand so a missing key for an unused provider never breaks startup.
export function getAiProvider(name: AiProviderName, env: Env = process.env): AiProvider {
  if (!isProviderConfigured(name, env)) {
    throw new Error(`${name} is not configured: set ${API_KEY_VARIABLE[name]}.`);
  }

  if (name === 'openrouter') {
    const client = new OpenAI({
      baseURL: OPENROUTER_BASE_URL,
      apiKey: env.OPENROUTER_API_KEY,
      defaultHeaders: { 'X-OpenRouter-Title': OPENROUTER_APP_TITLE },
      timeout: REQUEST_TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });

    return createOpenRouterProvider(client, {
      model: env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      audioModel: env.OPENROUTER_AUDIO_MODEL || DEFAULT_OPENROUTER_AUDIO_MODEL,
      dataCollection: resolveDataCollection(env),
    });
  }

  return createOpenAiProvider(
    new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: REQUEST_TIMEOUT_MS, maxRetries: MAX_RETRIES }),
  );
}
