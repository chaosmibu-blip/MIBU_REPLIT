import { Router } from "express";
import adminPlacesRouter from "./admin-places";
import adminUsersRouter from "./admin-users";
import adminContentRouter from "./admin-content";
import adminConfigsRouter from "./admin-configs";
import adminSubscriptionPlansRouter from "./admin-subscription-plans";
import adminSystemStatusRouter from "./admin-system-status";
import adminDashboardRouter from "./admin-dashboard";
import adminCommerceRouter from "./admin-commerce";

const router = Router();

router.use("/", adminDashboardRouter); // /admin/dashboard
router.use("/", adminPlacesRouter);
router.use("/", adminUsersRouter);
router.use("/", adminContentRouter);
router.use("/", adminConfigsRouter);
router.use("/", adminSubscriptionPlansRouter); // /admin/subscription-plans
router.use("/", adminSystemStatusRouter); // /admin/system-status
router.use("/", adminCommerceRouter); // /admin/merchants, /admin/refunds, /admin/finance

export default router;
