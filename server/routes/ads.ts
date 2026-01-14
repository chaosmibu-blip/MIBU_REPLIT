import { Router } from "express";
import { db } from "../db";
import { adPlacements } from "@shared/schema";
import { eq, and, or, isNull, lte, gte, desc } from "drizzle-orm";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

/**
 * GET /api/ads/placements
 * 取得廣告版位配置（給 APP 使用）
 *
 * Query:
 *   placement: 'gacha_loading' | 'gacha_result' | 'collection_detail' | 'itembox_open'
 *   platform: 'ios' | 'android' | 'web'
 *
 * Response:
 * {
 *   ad: {
 *     adUnitId: string | null,   // AdMob Unit ID
 *     adType: string,            // 'banner' | 'interstitial' | 'rewarded' | 'native'
 *     fallback: {                // 備用廣告（AdMob 失敗時使用）
 *       imageUrl: string | null,
 *       linkUrl: string | null,
 *       title: string | null
 *     } | null
 *   } | null
 * }
 */
router.get("/placements", async (req, res) => {
  try {
    const { placement, platform } = req.query;

    if (!placement || !platform) {
      return res.status(400).json(createErrorResponse(
        ErrorCode.MISSING_REQUIRED_FIELD,
        '缺少必要參數: placement, platform'
      ));
    }

    const validPlacements = ['gacha_loading', 'gacha_result', 'collection_detail', 'itembox_open'];
    const validPlatforms = ['ios', 'android', 'web'];

    if (!validPlacements.includes(placement as string)) {
      return res.status(400).json(createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `無效的 placement，有效值: ${validPlacements.join(', ')}`
      ));
    }

    if (!validPlatforms.includes(platform as string)) {
      return res.status(400).json(createErrorResponse(
        ErrorCode.INVALID_PARAMS,
        `無效的 platform，有效值: ${validPlatforms.join(', ')}`
      ));
    }

    const now = new Date();

    // 查詢符合條件的廣告
    const [adConfig] = await db
      .select()
      .from(adPlacements)
      .where(and(
        eq(adPlacements.placement, placement as string),
        eq(adPlacements.platform, platform as string),
        eq(adPlacements.isActive, true),
        // 時間範圍檢查
        or(isNull(adPlacements.startAt), lte(adPlacements.startAt, now)),
        or(isNull(adPlacements.endAt), gte(adPlacements.endAt, now))
      ))
      .orderBy(desc(adPlacements.priority))
      .limit(1);

    if (!adConfig) {
      // 沒有配置廣告，返回 null
      return res.json({ ad: null });
    }

    // 機率檢查
    const shouldShow = Math.random() * 100 < adConfig.showProbability;
    if (!shouldShow) {
      return res.json({ ad: null });
    }

    res.json({
      ad: {
        adUnitId: adConfig.adUnitId,
        adType: adConfig.adType,
        fallback: (adConfig.fallbackImageUrl || adConfig.fallbackLinkUrl || adConfig.fallbackTitle)
          ? {
              imageUrl: adConfig.fallbackImageUrl,
              linkUrl: adConfig.fallbackLinkUrl,
              title: adConfig.fallbackTitle,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Get ad placement error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得廣告配置'));
  }
});

/**
 * GET /api/ads/config
 * 取得所有廣告版位配置（管理後台用）
 */
router.get("/config", async (req, res) => {
  try {
    const configs = await db
      .select()
      .from(adPlacements)
      .orderBy(adPlacements.placement, adPlacements.platform);

    res.json({ configs });
  } catch (error) {
    console.error("Get ad configs error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得廣告配置'));
  }
});

export default router;
