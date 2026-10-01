import { ListMealsController } from '../controllers/ListMealsController';
import { createProtectedHandler } from '../utils/createHandler';

export const handler = createProtectedHandler(ListMealsController);
