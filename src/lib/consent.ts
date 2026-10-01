import { desc, eq } from 'drizzle-orm';

import { db } from '../db';
import { userConsentsTable } from '../db/schema';

// Bump this when the consent text shown in the app changes: everyone is asked again.
export const CURRENT_CONSENT_VERSION = '1';

type ConsentStatus = (typeof userConsentsTable.$inferSelect)['status'];

export type ConsentRecord = {
  version: string;
  status: ConsentStatus;
  createdAt?: Date;
};

export function isConsentValid(consent: ConsentRecord | null | undefined): consent is ConsentRecord {
  return consent?.status === 'accepted' && consent.version === CURRENT_CONSENT_VERSION;
}

export function findLatestConsent(userId: string) {
  return db.query.userConsentsTable.findFirst({
    columns: { version: true, status: true, createdAt: true },
    where: eq(userConsentsTable.userId, userId),
    orderBy: [desc(userConsentsTable.createdAt)],
  });
}

export async function hasValidConsent(userId: string): Promise<boolean> {
  return isConsentValid(await findLatestConsent(userId));
}

export function summarizeConsent(consent: ConsentRecord | null | undefined) {
  return {
    version: CURRENT_CONSENT_VERSION,
    accepted: isConsentValid(consent),
    acceptedAt: isConsentValid(consent) && consent.createdAt ? consent.createdAt.toISOString() : null,
  };
}
