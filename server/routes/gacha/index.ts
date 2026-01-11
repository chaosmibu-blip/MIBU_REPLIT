import { Router } from "express";
import gachaMainRouter from "./gacha-main";
import gachaV3Router from "./gacha-v3";
import submitTripRouter from "./submit-trip";

const router = Router();

router.use(gachaMainRouter);
router.use(gachaV3Router);
router.use(submitTripRouter);

export default router;
