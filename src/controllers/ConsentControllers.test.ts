import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const values = vi.fn();

  return { values, insert: vi.fn(() => ({ values })), findFirst: vi.fn() };
});

vi.mock('../db', () => ({
  db: { insert: mocks.insert, query: { userConsentsTable: { findFirst: mocks.findFirst } } },
}));

import { CURRENT_CONSENT_VERSION } from '../lib/consent';
import { AcceptConsentController } from './AcceptConsentController';
import { GetConsentController } from './GetConsentController';
import { WithdrawConsentController } from './WithdrawConsentController';

function buildRequest(body: Record<string, unknown> = {}) {
  return { userId: 'user-1', body, queryParams: {}, params: {} };
}

const acceptedRow = {
  version: CURRENT_CONSENT_VERSION,
  status: 'accepted',
  createdAt: new Date('2025-02-01T10:00:00Z'),
};

describe('consent controllers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.values.mockResolvedValue(undefined);
    mocks.findFirst.mockResolvedValue(undefined);
  });

  describe('GetConsentController', () => {
    it('reports the current version and that the user has not consented yet', async () => {
      // Act
      const response = await GetConsentController.handle(buildRequest());

      // Assert
      expect(response).toEqual({
        statusCode: 200,
        body: { consent: { version: CURRENT_CONSENT_VERSION, accepted: false, acceptedAt: null } },
      });
    });

    it('reports an accepted consent with its date', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue(acceptedRow);

      // Act
      const response = await GetConsentController.handle(buildRequest());

      // Assert
      expect(response.body?.consent).toEqual({
        version: CURRENT_CONSENT_VERSION,
        accepted: true,
        acceptedAt: '2025-02-01T10:00:00.000Z',
      });
    });

    it('asks again when the user only accepted an older version of the text', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue({ ...acceptedRow, version: 'old-version' });

      // Act
      const response = await GetConsentController.handle(buildRequest());

      // Assert
      expect(response.body?.consent.accepted).toBe(false);
    });

    it('asks again after a withdrawal', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue({ ...acceptedRow, status: 'withdrawn' });

      // Act
      const response = await GetConsentController.handle(buildRequest());

      // Assert
      expect(response.body?.consent).toEqual({
        version: CURRENT_CONSENT_VERSION,
        accepted: false,
        acceptedAt: null,
      });
    });
  });

  describe('AcceptConsentController', () => {
    it('records the acceptance of the current version for the authenticated user', async () => {
      // Act
      const response = await AcceptConsentController.handle(buildRequest({ version: CURRENT_CONSENT_VERSION }));

      // Assert
      expect(response.statusCode).toBe(201);
      expect(response.body?.consent.accepted).toBe(true);
      expect(mocks.values).toHaveBeenCalledWith({
        userId: 'user-1',
        version: CURRENT_CONSENT_VERSION,
        status: 'accepted',
      });
    });

    it('rejects a version that is not the current text, so nobody consents to something they did not see', async () => {
      // Act
      const response = await AcceptConsentController.handle(buildRequest({ version: 'old-version' }));

      // Assert
      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({ error: 'Outdated consent version.', currentVersion: CURRENT_CONSENT_VERSION });
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('rejects a request without a version', async () => {
      // Act
      const response = await AcceptConsentController.handle(buildRequest({}));

      // Assert
      expect(response.statusCode).toBe(400);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('does not add a duplicate record when consent is already valid', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue(acceptedRow);

      // Act
      const response = await AcceptConsentController.handle(buildRequest({ version: CURRENT_CONSENT_VERSION }));

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body?.consent.accepted).toBe(true);
      expect(mocks.insert).not.toHaveBeenCalled();
    });
  });

  describe('WithdrawConsentController', () => {
    it('records the withdrawal when the user had consented', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue(acceptedRow);

      // Act
      const response = await WithdrawConsentController.handle(buildRequest());

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body?.consent.accepted).toBe(false);
      expect(mocks.values).toHaveBeenCalledWith({
        userId: 'user-1',
        version: CURRENT_CONSENT_VERSION,
        status: 'withdrawn',
      });
    });

    it('is idempotent when there is nothing to withdraw', async () => {
      // Act
      const response = await WithdrawConsentController.handle(buildRequest());

      // Assert
      expect(response.statusCode).toBe(200);
      expect(response.body?.consent.accepted).toBe(false);
      expect(mocks.insert).not.toHaveBeenCalled();
    });

    it('is idempotent when the consent was already withdrawn', async () => {
      // Arrange
      mocks.findFirst.mockResolvedValue({ ...acceptedRow, status: 'withdrawn' });

      // Act
      await WithdrawConsentController.handle(buildRequest());

      // Assert
      expect(mocks.insert).not.toHaveBeenCalled();
    });
  });
});
