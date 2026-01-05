import { Router } from "express";
import adminPlacesRouter from "./admin-places";
import adminUsersRouter from "./admin-users";
import adminContentRouter from "./admin-content";

const router = Router();

router.use("/", adminPlacesRouter);
router.use("/", adminUsersRouter);
router.use("/", adminContentRouter);

export default router;
