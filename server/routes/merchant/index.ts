import { Router } from "express";
import profileRouter from "./profile";
import couponsRouter from "./coupons";
import dailyCodeRouter from "./daily-code";
import placesRouter from "./places";
import productsRouter from "./products";
import subscriptionRouter, { permissionsRouter } from "./subscription";

const router = Router();

// Profile routes: /api/merchant, /api/merchant/:id/plan, /api/merchant/register, /api/merchant/me
router.use("/api/merchant", profileRouter);

// Coupon routes: /api/coupons/*
router.use("/api/coupons", couponsRouter);

// Daily code routes: /api/merchant/daily-code, /api/merchant/verify-code, /api/merchant/verify
router.use("/api/merchant", dailyCodeRouter);

// Places routes: /api/merchant/places/*
router.use("/api/merchant/places", placesRouter);

// Products routes: /api/merchant/products/*
router.use("/api/merchant/products", productsRouter);

// Subscription routes: /api/merchant/subscription/*
router.use("/api/merchant/subscription", subscriptionRouter);

// Permissions route: /api/merchant/permissions
router.use("/api/merchant", permissionsRouter);

export default router;
