import z from 'zod';

import { db } from '../db';
import { userConsentsTable } from '../db/schema';
import { CURRENT_CONSENT_VERSION, findLatestConsent, isConsentValid, summarizeConsent } from '../lib/consent';
import { HttpResponse, ProtectedHttpRequest } from '../types/Http';
import { badRequest, created, ok } from '../utils/http';

const schema = z.object({
  version: z.string(),
});

export class AcceptConsentController {
  static async handle({ userId, body }: ProtectedHttpRequest): Promise<HttpResponse> {
    const { success, error, data } = schema.safeParse(body);

    if (!success) {
      return badRequest({ errors: error.issues });
    }

    // The user must accept the text they were shown, so a stale app cannot consent to a newer text.
    if (data.version !== CURRENT_CONSENT_VERSION) {
      return badRequest({ error: 'Outdated consent version.', currentVersion: CURRENT_CONSENT_VERSION });
    }

    const existing = await findLatestConsent(userId);

    if (isConsentValid(existing)) {
      return ok({ consent: summarizeConsent(existing) });
    }

    await db.insert(userConsentsTable).values({ userId, version: data.version, status: 'accepted' });

    return created({
      consent: summarizeConsent({ version: data.version, status: 'accepted', createdAt: new Date() }),
    });
  }
}
