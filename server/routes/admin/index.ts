import { Router } from "express";
import adminPlacesRouter from "./admin-places";
import adminUsersRouter from "./admin-users";
import adminContentRouter from "./admin-content";
import adminConfigsRouter from "./admin-configs";
import adminSubscriptionPlansRouter from "./admin-subscription-plans";
import adminSystemStatusRouter from "./admin-system-status";

const router = Router();

router.use("/", adminPlacesRouter);
router.use("/", adminUsersRouter);
router.use("/", adminContentRouter);
router.use("/", adminConfigsRouter);
router.use("/", adminSubscriptionPlansRouter); // /admin/subscription-plans
router.use("/", adminSystemStatusRouter); // /admin/system-status

export default router;
