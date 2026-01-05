import { Router } from 'express';
import authRouter, { profileRouter } from './auth';
import sosRouter from './sos';
import collectionsRouter from './collections';
import merchantRouter from './merchant';
import specialistRouter from './specialist';
import chatRouter from './chat';
import commerceRouter from './commerce';
import locationsRouter from './locations';
import gachaRouter from './gacha';
import adminRouter from './admin';

const router = Router();

router.use('/auth', authRouter);
router.use('/', profileRouter);
router.use('/', sosRouter);
router.use('/collections', collectionsRouter);
router.use('/merchant', merchantRouter);
router.use('/specialist', specialistRouter);
router.use('/', chatRouter);
router.use('/commerce', commerceRouter);
router.use('/locations', locationsRouter);
router.use('/', locationsRouter);
router.use('/', gachaRouter);
router.use('/admin', adminRouter);

export default router;

export {
  authRouter,
  profileRouter,
  sosRouter,
  collectionsRouter,
  merchantRouter,
  specialistRouter,
  chatRouter,
  commerceRouter,
  locationsRouter,
  gachaRouter,
  adminRouter
};
