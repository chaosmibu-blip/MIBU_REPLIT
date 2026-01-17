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
import notificationsRouter from './notifications';
import adsRouter from './ads';
import monitoringRouter from './monitoring';
import economyRouter from './economy';
import crowdfundRouter from './crowdfund';
import referralRouter from './referral';
import contributionRouter from './contribution';
import accountRouter from './account';
import eventsRouter, { eventsAdminRouter } from './events';
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
router.use('/notifications', notificationsRouter); // 通知 API: /api/notifications
router.use('/ads', adsRouter); // 廣告 API: /api/ads/placements
router.use('/', subscriptionPlansPublicRouter); // 公開 API: /api/subscription-plans
router.use('/', monitoringRouter); // 監控 API: /api/health, /api/health/detailed, /api/metrics
router.use('/', economyRouter); // 經濟系統 API: /api/user/level, /api/user/achievements, /api/levels
router.use('/', crowdfundRouter); // 募資系統 API: /api/crowdfund/campaigns, /api/crowdfund/contribute
router.use('/', referralRouter); // 推薦系統 API: /api/referral/*
router.use('/', contributionRouter); // 用戶貢獻 API: /api/contribution/*, /api/collection/blacklist
router.use('/', accountRouter); // 帳號系統 API: /api/account/*, /api/auth/migrate-guest, /api/specialist/apply
router.use('/events', eventsRouter); // 活動系統 API: /api/events
router.use('/admin/events', eventsAdminRouter); // 活動管理 API: /api/admin/events/*

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
  monitoringRouter,
  economyRouter,
  crowdfundRouter,
  referralRouter,
  contributionRouter,
  accountRouter,
  eventsRouter,
  eventsAdminRouter,
};
