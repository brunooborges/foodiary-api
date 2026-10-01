import { GetConsentController } from '../controllers/GetConsentController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(GetConsentController);
