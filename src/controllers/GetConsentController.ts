import { findLatestConsent, summarizeConsent } from '../lib/consent';
import { HttpResponse, ProtectedHttpRequest } from '../types/Http';
import { ok } from '../utils/http';

export class GetConsentController {
  static async handle({ userId }: ProtectedHttpRequest): Promise<HttpResponse> {
    const consent = await findLatestConsent(userId);

    return ok({ consent: summarizeConsent(consent) });
  }
}
