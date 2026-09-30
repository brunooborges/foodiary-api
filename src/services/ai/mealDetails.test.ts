import { describe, expect, it } from 'vitest';

import { parseMealDetails } from './mealDetails';

// Right-to-left override: a bidirectional control character that must never survive sanitization.
const RLO = String.fromCodePoint(0x202e);

const validMeal = {
  name: 'Jantar',
  icon: '🍗',
  foods: [
    {
      name: 'Arroz branco cozido',
      quantity: '150g',
      calories: 193,
      carbohydrates: 42,
      proteins: 3.5,
      fats: 0.4,
    },
  ],
};

describe('parseMealDetails', () => {
  it('parses a plain JSON response', () => {
    // Arrange
    const raw = JSON.stringify(validMeal);

    // Act
    const result = parseMealDetails(raw);

    // Assert
    expect(result).toEqual(validMeal);
  });

  it('parses JSON wrapped in a markdown code fence', () => {
    // Arrange
    const raw = `\`\`\`json\n${JSON.stringify(validMeal, null, 2)}\n\`\`\``;

    // Act
    const result = parseMealDetails(raw);

    // Assert
    expect(result).toEqual(validMeal);
  });

  it('parses JSON surrounded by whitespace', () => {
    // Arrange
    const raw = `\n\n  ${JSON.stringify(validMeal)}  \n`;

    // Act & Assert
    expect(parseMealDetails(raw)).toEqual(validMeal);
  });

  it('throws when the model returned no content', () => {
    expect(() => parseMealDetails(null)).toThrow('Failed to process meal');
    expect(() => parseMealDetails('')).toThrow('Failed to process meal');
  });

  it('throws when the content is not valid JSON', () => {
    expect(() => parseMealDetails('Desculpe, não consegui identificar a refeição.')).toThrow(
      'Failed to process meal',
    );
  });

  it('throws when a food is missing required nutrition fields', () => {
    // Arrange
    const raw = JSON.stringify({ ...validMeal, foods: [{ name: 'Arroz', quantity: '150g' }] });

    // Act & Assert
    expect(() => parseMealDetails(raw)).toThrow('Failed to process meal');
  });

  it('rejects values that would not fit the database columns or make no sense', () => {
    const withFood = (food: Record<string, unknown>) =>
      JSON.stringify({ ...validMeal, foods: [{ ...validMeal.foods[0], ...food }] });

    expect(() => parseMealDetails(JSON.stringify({ ...validMeal, name: 'a'.repeat(256) }))).toThrow(
      'Failed to process meal',
    );
    expect(() => parseMealDetails(JSON.stringify({ ...validMeal, icon: 'a'.repeat(101) }))).toThrow(
      'Failed to process meal',
    );
    expect(() => parseMealDetails(withFood({ calories: -1 }))).toThrow('Failed to process meal');
    expect(() => parseMealDetails(withFood({ proteins: 1_000_000 }))).toThrow('Failed to process meal');
    expect(() => parseMealDetails(withFood({ name: 'a'.repeat(256) }))).toThrow('Failed to process meal');
  });

  it('accepts loosely typed numbers, which models sometimes return, and normalizes them', () => {
    // Arrange
    const raw = JSON.stringify({
      ...validMeal,
      foods: [{ name: 'Arroz', quantity: 150, calories: '193', carbohydrates: '42', proteins: 3.5, fats: '0.4' }],
    });

    // Act
    const result = parseMealDetails(raw);

    // Assert
    expect(result.foods[0]).toEqual({
      name: 'Arroz',
      quantity: '150',
      calories: 193,
      carbohydrates: 42,
      proteins: 3.5,
      fats: 0.4,
    });
  });

  it('still rejects numbers that are not numeric', () => {
    // Arrange
    const raw = JSON.stringify({
      ...validMeal,
      foods: [{ ...validMeal.foods[0], calories: 'muitas' }],
    });

    // Act & Assert
    expect(() => parseMealDetails(raw)).toThrow('Failed to process meal');
  });

  it('removes control characters from the text the app will display', () => {
    // Arrange
    const raw = JSON.stringify({
      ...validMeal,
      name: 'Jantar\u0000' + RLO + '',
      icon: '🍗\u0007',
      foods: [{ ...validMeal.foods[0], name: '  Arroz\u0000 branco  ', quantity: '150g' + RLO + '' }],
    });

    // Act
    const result = parseMealDetails(raw);

    // Assert
    expect(result.name).toBe('Jantar');
    expect(result.icon).toBe('🍗');
    expect(result.foods[0].name).toBe('Arroz branco');
    expect(result.foods[0].quantity).toBe('150g');
  });

  it('rejects empty names, which would leave the meal blank in the app', () => {
    const withName = (name: string) => JSON.stringify({ ...validMeal, name });

    expect(() => parseMealDetails(withName(''))).toThrow('Failed to process meal');
    expect(() => parseMealDetails(withName('\u0000' + RLO + ''))).toThrow('Failed to process meal');
  });

  it('rejects implausible nutrition values for a single food', () => {
    const withFood = (food: Record<string, unknown>) =>
      JSON.stringify({ ...validMeal, foods: [{ ...validMeal.foods[0], ...food }] });

    expect(parseMealDetails(withFood({ calories: 10_000 })).foods[0].calories).toBe(10_000);
    expect(() => parseMealDetails(withFood({ calories: 10_001 }))).toThrow('Failed to process meal');
    expect(() => parseMealDetails(withFood({ fats: 2_001 }))).toThrow('Failed to process meal');
  });

  it('rejects an unreasonably long list of foods', () => {
    // Arrange
    const foods = Array.from({ length: 51 }, () => validMeal.foods[0]);

    // Act & Assert
    expect(() => parseMealDetails(JSON.stringify({ ...validMeal, foods }))).toThrow('Failed to process meal');
  });

  it('throws when the meal has no name or icon', () => {
    expect(() => parseMealDetails(JSON.stringify({ foods: [] }))).toThrow('Failed to process meal');
  });
});
