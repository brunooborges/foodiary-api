export const AI_PROVIDER_NAMES = ['openai', 'openrouter'] as const;

export type AiProviderName = (typeof AI_PROVIDER_NAMES)[number];
