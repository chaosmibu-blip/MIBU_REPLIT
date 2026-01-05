import { Router } from "express";
import gachaMainRouter from "./gacha-main";
import gachaCoreRouter from "./gacha-core";
import gachaV2V3Router from "./gacha-v2v3";

const router = Router();

router.use(gachaMainRouter);
router.use(gachaCoreRouter);
router.use(gachaV2V3Router);

export default router;
