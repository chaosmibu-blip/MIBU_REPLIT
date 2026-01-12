import { Router } from 'express';
import authRouter, { profileRouter } from './auth';
import sosRouter from './sos';
import collectionsRouter from './collections';
import merchantRouter from './merchant';
import specialistRouter from './specialist';
import chatRouter from './chat';
import commerceRouter from './commerce';
import locationsRouter from './locations';
import gachaRouter from './gacha/index';
import adminRouter from './admin/index';
import seoRouter from './seo';
import inventoryRouter from './inventory';
import { subscriptionPlansPublicRouter } from './admin/admin-subscription-plans';
import { storage } from '../storage';
import { AnnouncementType } from '@shared/schema';
import { ErrorCode, createErrorResponse } from '@shared/errors';

const router = Router();

router.get('/announcements', async (req, res) => {
  try {
    const type = req.query.type as AnnouncementType | undefined;
    const validTypes: AnnouncementType[] = ['announcement', 'flash_event', 'holiday_event'];
    const announcementType = type && validTypes.includes(type) ? type : undefined;
    
    const announcements = await storage.getActiveAnnouncements(announcementType);
    res.json({ announcements });
  } catch (error) {
    console.error('Get active announcements error:', error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得公告'));
  }
});

router.use('/auth', authRouter);
router.use('/', profileRouter);
router.use('/', sosRouter);
router.use('/collections', collectionsRouter);
// merchant routes are mounted directly in routes.ts
router.use('/specialist', specialistRouter);
router.use('/', chatRouter);
router.use('/commerce', commerceRouter);
router.use('/locations', locationsRouter);
router.use('/', gachaRouter);
router.use('/admin', adminRouter);
router.use('/seo', seoRouter); // SEO API: /api/seo/cities, /api/seo/places
router.use('/inventory', inventoryRouter); // Inventory API: /api/inventory, /api/inventory/capacity
router.use('/', subscriptionPlansPublicRouter); // 公開 API: /api/subscription-plans

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
  adminRouter,
  inventoryRouter,
};
