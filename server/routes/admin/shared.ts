import { storage } from "../../storage";

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
