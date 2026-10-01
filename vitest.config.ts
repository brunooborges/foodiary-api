import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/services/ai/**/*.ts',
        'src/queues/ProcessMeal.ts',
        'src/controllers/CreateMealController.ts',
        'src/controllers/GetConsentController.ts',
        'src/controllers/AcceptConsentController.ts',
        'src/controllers/WithdrawConsentController.ts',
        'src/lib/consent.ts',
        'src/lib/uploadLimits.ts',
        'src/utils/describeError.ts',
        'src/utils/createHandler.ts',
        'src/utils/parseEvent.ts',
        'src/utils/parseProtectedEvent.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/services/ai/types.ts'],
      thresholds: { lines: 80, functions: 80, statements: 80, branches: 80 },
    },
  },
});
