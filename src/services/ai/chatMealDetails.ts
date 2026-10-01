import type OpenAI from 'openai';

import { MealDetails, parseMealDetails } from './mealDetails';
import { MEAL_TEXT_SYSTEM_PROMPT, buildMealImageSystemPrompt, buildMealTextUserPrompt } from './prompts';
import { GetMealDetailsFromImageParams, GetMealDetailsFromTextParams } from './types';

export type ChatMealDetailsOptions = {
  model: string;
  responseFormat?: { type: 'json_object' };
  // Provider-specific request fields that the OpenAI SDK types do not know about.
  extraBody?: Record<string, unknown>;
};

export async function requestMealDetailsFromText(
  client: OpenAI,
  { model, responseFormat, extraBody }: ChatMealDetailsOptions,
  { createdAt, text }: GetMealDetailsFromTextParams,
): Promise<MealDetails> {
  const response = await client.chat.completions.create({
    model,
    ...extraBody,
    ...(responseFormat && { response_format: responseFormat }),
    messages: [
      { role: 'system', content: MEAL_TEXT_SYSTEM_PROMPT },
      { role: 'user', content: buildMealTextUserPrompt({ createdAt, text }) },
    ],
  });

  return parseMealDetails(response.choices[0]?.message.content);
}

export async function requestMealDetailsFromImage(
  client: OpenAI,
  { model, responseFormat, extraBody }: ChatMealDetailsOptions,
  { createdAt, imageURL }: GetMealDetailsFromImageParams,
): Promise<MealDetails> {
  const response = await client.chat.completions.create({
    model,
    ...extraBody,
    ...(responseFormat && { response_format: responseFormat }),
    messages: [
      { role: 'system', content: buildMealImageSystemPrompt(createdAt) },
      { role: 'user', content: [{ type: 'image_url', image_url: { url: imageURL } }] },
    ],
  });

  return parseMealDetails(response.choices[0]?.message.content);
}
