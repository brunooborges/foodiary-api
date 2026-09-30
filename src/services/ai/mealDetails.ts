import z from 'zod';

import { stripControlCharacters } from './sanitize';

// Limits match the meals table columns (name varchar(255), icon varchar(100)) and keep model output sane.
const MAX_NAME_LENGTH = 255;
const MAX_ICON_LENGTH = 100;
const MAX_QUANTITY_LENGTH = 100;
const MAX_FOODS = 50;
// Upper bounds for a single food item; anything above is treated as a bad (or manipulated) model answer.
const MAX_CALORIES = 10_000;
const MAX_MACRO_GRAMS = 2_000;

// Models sometimes return numbers as strings ("193"), so both forms are accepted and normalized.
const nutrient = (max: number) =>
  z
    .union([z.number(), z.string().trim().regex(/^\d+(\.\d+)?$/).transform(Number)])
    .pipe(z.number().min(0).max(max));

// Text is displayed in the app and stored in varchar columns: control characters are removed and size is bounded.
const cleanText = (maxLength: number) =>
  z.string().transform(stripControlCharacters).pipe(z.string().min(1).max(maxLength));

const quantity = z
  .union([z.string(), z.number()])
  .transform(String)
  .transform(stripControlCharacters)
  .pipe(z.string().max(MAX_QUANTITY_LENGTH));

const mealDetailsSchema = z.object({
  name: cleanText(MAX_NAME_LENGTH),
  icon: cleanText(MAX_ICON_LENGTH),
  foods: z
    .array(
      z.object({
        name: cleanText(MAX_NAME_LENGTH),
        quantity,
        calories: nutrient(MAX_CALORIES),
        carbohydrates: nutrient(MAX_MACRO_GRAMS),
        proteins: nutrient(MAX_MACRO_GRAMS),
        fats: nutrient(MAX_MACRO_GRAMS),
      }),
    )
    .max(MAX_FOODS),
});

export type MealDetails = z.infer<typeof mealDetailsSchema>;

const CODE_FENCE_PATTERN = /^```(?:json)?\s*([\s\S]*?)\s*```$/i;

function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const match = CODE_FENCE_PATTERN.exec(trimmed);

  return match ? match[1] : trimmed;
}

export function parseMealDetails(content: string | null | undefined): MealDetails {
  if (!content) {
    throw new Error('Failed to process meal: the model returned no content.');
  }

  let json: unknown;

  try {
    json = JSON.parse(stripCodeFence(content));
  } catch {
    throw new Error('Failed to process meal: the model did not return valid JSON.');
  }

  const result = mealDetailsSchema.safeParse(json);

  if (!result.success) {
    throw new Error('Failed to process meal: the meal details have an invalid format.');
  }

  return result.data;
}
