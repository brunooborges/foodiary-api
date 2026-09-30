import { SignInController } from '../controllers/SignInController';
import { createPublicHandler } from '../utils/createHandler';

export const handler = createPublicHandler(SignInController);
