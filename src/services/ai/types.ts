import type { MealDetails } from './mealDetails';

export type GetMealDetailsFromTextParams = {
  text: string;
  createdAt: Date;
};

export type GetMealDetailsFromImageParams = {
  imageURL: string;
  createdAt: Date;
};

export interface AiProvider {
  transcribeAudio(fileBuffer: Buffer): Promise<string>;
  getMealDetailsFromText(params: GetMealDetailsFromTextParams): Promise<MealDetails>;
  getMealDetailsFromImage(params: GetMealDetailsFromImageParams): Promise<MealDetails>;
}
