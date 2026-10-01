import { MeController } from '../controllers/MeController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(MeController);
