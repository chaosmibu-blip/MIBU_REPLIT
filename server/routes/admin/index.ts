import { Router } from "express";
import adminPlacesRouter from "./admin-places";
import adminUsersRouter from "./admin-users";
import adminContentRouter from "./admin-content";
import adminConfigsRouter from "./admin-configs";
import adminSubscriptionPlansRouter from "./admin-subscription-plans";

const router = Router();

router.use("/", adminPlacesRouter);
router.use("/", adminUsersRouter);
router.use("/", adminContentRouter);
router.use("/", adminConfigsRouter);
router.use("/", adminSubscriptionPlansRouter);

export default router;
