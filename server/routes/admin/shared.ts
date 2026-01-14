import { Request, Response, NextFunction } from "express";
import { storage } from "../../storage";
import { ErrorCode, createErrorResponse } from "@shared/errors";

export const hasAdminAccess = async (req: any): Promise<boolean> => {
  const userId = req.user?.claims?.sub;
  if (!userId) return false;

  const user = await storage.getUser(userId);
  if (!user) return false;

  const SUPER_ADMIN_EMAIL = 's8869420@gmail.com';
  const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

  const activeRole = req.jwtUser?.activeRole || (req.session as any)?.activeRole || user.role;

  return isSuperAdmin || activeRole === 'admin';
};

/**
 * Middleware: 驗證管理員權限
 */
export const requireAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const queryKey = req.query.key as string;
  const adminKey = process.env.ADMIN_MIGRATION_KEY;

  // 支援 query key 驗證（用於腳本）
  if (queryKey && adminKey && queryKey === adminKey) {
    return next();
  }

  // 支援 session/JWT 驗證
  const hasAccess = await hasAdminAccess(req);
  if (hasAccess) {
    return next();
  }

  return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED, '需要管理員權限'));
};
