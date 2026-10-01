import { CreateMealController } from '../controllers/CreateMealController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(CreateMealController);
