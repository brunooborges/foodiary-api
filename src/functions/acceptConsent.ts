import { AcceptConsentController } from '../controllers/AcceptConsentController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(AcceptConsentController);
