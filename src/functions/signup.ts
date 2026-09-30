import { SignUpController } from '../controllers/SignUpController';
import { createPublicHandler } from '../utils/createHandler';

export const handler = createPublicHandler(SignUpController);
