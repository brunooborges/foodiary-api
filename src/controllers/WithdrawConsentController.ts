import { db } from '../db';
import { userConsentsTable } from '../db/schema';
import { findLatestConsent, summarizeConsent } from '../lib/consent';
import { HttpResponse, ProtectedHttpRequest } from '../types/Http';
import { ok } from '../utils/http';

export class WithdrawConsentController {
  static async handle({ userId }: ProtectedHttpRequest): Promise<HttpResponse> {
    const existing = await findLatestConsent(userId);

    if (existing?.status === 'accepted') {
      await db.insert(userConsentsTable).values({ userId, version: existing.version, status: 'withdrawn' });
    }

    return ok({ consent: summarizeConsent(undefined) });
  }
}
