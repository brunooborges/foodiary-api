import { GetMealByIdController } from '../controllers/GetMealByIdController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(GetMealByIdController);
