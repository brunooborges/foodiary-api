import { WithdrawConsentController } from '../controllers/WithdrawConsentController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(WithdrawConsentController);
