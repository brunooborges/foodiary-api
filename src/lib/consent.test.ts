import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock('../db', () => ({ db: { query: { userConsentsTable: { findFirst: mocks.findFirst } } } }));

import { CURRENT_CONSENT_VERSION, findLatestConsent, hasValidConsent, isConsentValid } from './consent';

describe('consent', () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
  });

  describe('isConsentValid', () => {
    it('is valid only for an accepted consent of the current version', () => {
      expect(isConsentValid({ version: CURRENT_CONSENT_VERSION, status: 'accepted' })).toBe(true);
    });

    it('is not valid when withdrawn', () => {
      expect(isConsentValid({ version: CURRENT_CONSENT_VERSION, status: 'withdrawn' })).toBe(false);
    });

    it('is not valid for an older version of the text', () => {
      expect(isConsentValid({ version: 'old-version', status: 'accepted' })).toBe(false);
    });

    it('is not valid when the user never answered', () => {
      expect(isConsentValid(undefined)).toBe(false);
      expect(isConsentValid(null)).toBe(false);
    });
  });

  describe('hasValidConsent', () => {
    it('reads the most recent answer of the user', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue({ version: CURRENT_CONSENT_VERSION, status: 'accepted' });

      // Act
      const result = await hasValidConsent('user-1');

      // Assert
      expect(result).toBe(true);
      expect(mocks.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.anything(), orderBy: expect.anything() }),
      );
    });

    it('is false when the user has no consent on record', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue(undefined);

      // Act & Assert
      expect(await hasValidConsent('user-1')).toBe(false);
    });

    it('is false when the latest answer is a withdrawal', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue({ version: CURRENT_CONSENT_VERSION, status: 'withdrawn' });

      // Act & Assert
      expect(await hasValidConsent('user-1')).toBe(false);
    });
  });

  describe('findLatestConsent', () => {
    it('returns the latest row', async () => {
      // Arrange
      const row = { version: CURRENT_CONSENT_VERSION, status: 'accepted', createdAt: new Date('2025-01-01') };
      mocks.findFirst.mockResolvedValue(row);

      // Act & Assert
      expect(await findLatestConsent('user-1')).toEqual(row);
    });
  });
});
