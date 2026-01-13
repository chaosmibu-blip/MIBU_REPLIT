import { Router, isAuthenticated, storage, ErrorCode, createErrorResponse } from "./shared";

const router = Router();

// ============ Merchant Products Routes ============

router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const products = await storage.getMerchantProducts(merchant.id);
    res.json({ products });
  } catch (error) {
    console.error("Get merchant products error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得商品'));
  }
});

router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const { name, description, price, category, imageUrl, stock } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '商品名稱和價格為必填'));
    }

    const product = await storage.createProduct({
      merchantId: merchant.id,
      name,
      description: description || null,
      price: parseInt(price),
      currency: 'TWD',
      category: category || null,
      imageUrl: imageUrl || null,
      isActive: true,
      stock: stock ? parseInt(stock) : null
    });

    res.json({ success: true, product });
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法建立商品'));
  }
});

router.put("/:productId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const productId = parseInt(req.params.productId);
    const existing = await storage.getProductById(productId);
    if (!existing || existing.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.PRODUCT_NOT_FOUND));
    }

    const { name, description, price, category, imageUrl, isActive, stock } = req.body;
    const updated = await storage.updateProduct(productId, {
      name,
      description,
      price: price !== undefined ? parseInt(price) : undefined,
      category,
      imageUrl,
      isActive,
      stock: stock !== undefined ? parseInt(stock) : undefined
    });

    res.json({ success: true, product: updated });
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法更新商品'));
  }
});

router.delete("/:productId", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const merchant = await storage.getMerchantByUserId(userId);
    if (!merchant) {
      return res.status(403).json(createErrorResponse(ErrorCode.MERCHANT_REQUIRED));
    }

    const productId = parseInt(req.params.productId);
    const existing = await storage.getProductById(productId);
    if (!existing || existing.merchantId !== merchant.id) {
      return res.status(404).json(createErrorResponse(ErrorCode.PRODUCT_NOT_FOUND));
    }

    await storage.deleteProduct(productId);
    res.json({ success: true });
  } catch (error) {
    console.error("Delete product error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法刪除商品'));
  }
});

export default router;
