import { Router } from "express";
import adminPlacesRouter from "./admin-places";
import adminUsersRouter from "./admin-users";
import adminContentRouter from "./admin-content";
import adminConfigsRouter from "./admin-configs";

const router = Router();

router.use("/", adminPlacesRouter);
router.use("/", adminUsersRouter);
router.use("/", adminContentRouter);
router.use("/", adminConfigsRouter);

export default router;
