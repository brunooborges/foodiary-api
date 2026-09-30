import { date, index, integer, json, pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

import { AI_PROVIDER_NAMES } from '../types/AiProvider';

export const usersTable = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  name: varchar({ length: 255 }).notNull(),
  email: varchar({ length: 255 }).notNull().unique(),
  password: varchar({ length: 255 }).notNull(),
  goal: varchar({ length: 8 }).notNull(),
  gender: varchar({ length: 6 }).notNull(),
  birthDate: date('birth_date').notNull(),
  height: integer().notNull(),
  weight: integer().notNull(),
  activityLevel: integer('activity_level').notNull(),
  // Goals
  calories: integer().notNull(),
  proteins: integer().notNull(),
  carbohydrates: integer().notNull(),
  fats: integer().notNull(),
});

export const aiProvider = pgEnum('ai_provider', AI_PROVIDER_NAMES);

export const userSettingsTable = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  aiProvider: aiProvider('ai_provider').notNull().default('openai'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const consentStatus = pgEnum('consent_status', ['accepted', 'withdrawn']);

// Append-only history: every acceptance or withdrawal is a new row, so there is always proof of what the user
// agreed to (and which version of the text). The newest row of a user is the one that counts.
export const userConsentsTable = pgTable(
  'user_consents',
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersTable.id, { onDelete: 'cascade' }),
    version: varchar({ length: 20 }).notNull(),
    status: consentStatus().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [index('user_consents_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

export const mealStatus = pgEnum('meal_status', ['uploading', 'processing', 'success', 'failed']);

export const mealInputType = pgEnum('meal_input_type', ['audio', 'picture']);

export const mealsTable = pgTable('meals', {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),
  status: mealStatus().notNull(),
  inputType: mealInputType('input_type').notNull(),
  inputFileKey: varchar('input_file_key', { length: 255 }).notNull(),
  name: varchar({ length: 255 }).notNull(),
  icon: varchar({ length: 100 }).notNull(),
  foods: json(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
