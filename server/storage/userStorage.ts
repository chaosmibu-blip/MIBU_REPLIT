import { db } from "../db";
import { eq, desc, and } from "drizzle-orm";
import {
  users,
  collections,
  merchants,
  specialists,
  serviceRelations,
  userDailyGachaStats,
  userInventory,
  couponRedemptions,
  userNotifications,
  userLocations,
  placeFeedback,
  collectionReadStatus,
  userProfiles,
  cartItems,
  serviceOrders,
  commerceOrders,
  tripServicePurchases,
  planners,
  tripPlans,
  tripDays,
  tripActivities,
  sosAlerts,
  sosEvents,
  travelCompanions,
  chatInvites,
  authIdentities,
  gachaAiLogs,
  type User,
  type UpsertUser,
  type InsertAuthIdentity,
  type AuthIdentity,
} from "@shared/schema";

export const userStorage = {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  },

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  },

  async createUser(userData: UpsertUser): Promise<User> {
    const [user] = await db.insert(users).values(userData).returning();
    return user;
  },

  async upsertUser(userData: UpsertUser): Promise<User> {
    if (userData.email && userData.id) {
      const existingUserByEmail = await userStorage.getUserByEmail(userData.email);
      
      if (existingUserByEmail && existingUserByEmail.id !== userData.id) {
        console.log(`[upsertUser] 發現帳號合併需求: 舊ID=${existingUserByEmail.id}, 新ID=${userData.id}`);
        
        const [newUser] = await db.transaction(async (tx) => {
          const [createdUser] = await tx
            .insert(users)
            .values(userData)
            .onConflictDoUpdate({
              target: users.id,
              set: {
                ...userData,
                updatedAt: new Date(),
              },
            })
            .returning();
          
          console.log(`[upsertUser] 新用戶已創建/更新: ${createdUser.id}`);
          
          await userStorage.migrateUserDataInTransaction(tx, existingUserByEmail.id, userData.id!);
          
          await tx.delete(users).where(eq(users.id, existingUserByEmail.id));
          console.log(`[upsertUser] 已刪除舊用戶記錄: ${existingUserByEmail.id}`);
          
          return [createdUser];
        });
        
        return newUser;
      }
    }
    
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  },

  async migrateUserDataInTransaction(tx: any, oldUserId: string, newUserId: string): Promise<void> {
    console.log(`[migrateUserData] 開始遷移: ${oldUserId} -> ${newUserId}`);
    
    const updatedCollections = await tx.update(collections)
      .set({ userId: newUserId })
      .where(eq(collections.userId, oldUserId))
      .returning();
    console.log(`[migrateUserData] 遷移 collections: ${updatedCollections.length} 筆`);
    
    await tx.update(userDailyGachaStats)
      .set({ userId: newUserId })
      .where(eq(userDailyGachaStats.userId, oldUserId));
    
    await tx.update(userInventory)
      .set({ userId: newUserId })
      .where(eq(userInventory.userId, oldUserId));
    
    await tx.update(couponRedemptions)
      .set({ userId: newUserId })
      .where(eq(couponRedemptions.userId, oldUserId));
    
    await tx.update(userNotifications)
      .set({ userId: newUserId })
      .where(eq(userNotifications.userId, oldUserId));
    
    await tx.update(userLocations)
      .set({ userId: newUserId })
      .where(eq(userLocations.userId, oldUserId));
    
    await tx.update(placeFeedback)
      .set({ userId: newUserId })
      .where(eq(placeFeedback.userId, oldUserId));
    
    await tx.update(collectionReadStatus)
      .set({ userId: newUserId })
      .where(eq(collectionReadStatus.userId, oldUserId));
    
    await tx.update(userProfiles)
      .set({ userId: newUserId })
      .where(eq(userProfiles.userId, oldUserId));
    
    await tx.update(cartItems)
      .set({ userId: newUserId })
      .where(eq(cartItems.userId, oldUserId));
    
    await tx.update(serviceOrders)
      .set({ userId: newUserId })
      .where(eq(serviceOrders.userId, oldUserId));
    
    await tx.update(commerceOrders)
      .set({ userId: newUserId })
      .where(eq(commerceOrders.userId, oldUserId));
    
    await tx.update(tripServicePurchases)
      .set({ userId: newUserId })
      .where(eq(tripServicePurchases.userId, oldUserId));
    
    await tx.update(tripServicePurchases)
      .set({ purchasedForUserId: newUserId })
      .where(eq(tripServicePurchases.purchasedForUserId, oldUserId));
    
    await tx.update(planners)
      .set({ userId: newUserId })
      .where(eq(planners.userId, oldUserId));
    
    await tx.update(tripPlans)
      .set({ userId: newUserId })
      .where(eq(tripPlans.userId, oldUserId));
    
    await tx.update(specialists)
      .set({ userId: newUserId })
      .where(eq(specialists.userId, oldUserId));
    
    await tx.update(serviceRelations)
      .set({ travelerId: newUserId })
      .where(eq(serviceRelations.travelerId, oldUserId));
    
    await tx.update(sosAlerts)
      .set({ userId: newUserId })
      .where(eq(sosAlerts.userId, oldUserId));
    
    await tx.update(sosEvents)
      .set({ userId: newUserId })
      .where(eq(sosEvents.userId, oldUserId));
    
    await tx.update(travelCompanions)
      .set({ userId: newUserId })
      .where(eq(travelCompanions.userId, oldUserId));
    
    await tx.update(chatInvites)
      .set({ inviterUserId: newUserId })
      .where(eq(chatInvites.inviterUserId, oldUserId));
    
    await tx.update(chatInvites)
      .set({ usedByUserId: newUserId })
      .where(eq(chatInvites.usedByUserId, oldUserId));
    
    await tx.update(merchants)
      .set({ userId: newUserId })
      .where(eq(merchants.userId, oldUserId));
    
    await tx.update(gachaAiLogs)
      .set({ userId: newUserId })
      .where(eq(gachaAiLogs.userId, oldUserId));
    
    // 遷移 authIdentities - 需要特別處理，因為可能有衝突
    const oldIdentities = await tx.select().from(authIdentities)
      .where(eq(authIdentities.userId, oldUserId));
    
    for (const identity of oldIdentities) {
      // 檢查新用戶是否已有相同 provider 的 identity
      const existingIdentity = await tx.select().from(authIdentities)
        .where(
          and(
            eq(authIdentities.userId, newUserId),
            eq(authIdentities.provider, identity.provider)
          )
        );
      
      if (existingIdentity.length > 0) {
        // 如果新用戶已有相同 provider，刪除舊的
        await tx.delete(authIdentities)
          .where(eq(authIdentities.id, identity.id));
        console.log(`[migrateUserData] 刪除重複 identity: ${identity.provider} (舊用戶已有)`);
      } else {
        // 否則遷移到新用戶
        await tx.update(authIdentities)
          .set({ userId: newUserId })
          .where(eq(authIdentities.id, identity.id));
        console.log(`[migrateUserData] 遷移 identity: ${identity.provider}`);
      }
    }
    
    console.log(`[migrateUserData] 遷移完成`);
  },

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  },

  async getPendingApprovalUsers(): Promise<User[]> {
    return await db.select().from(users).where(eq(users.isApproved, false));
  },

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  },

  async approveUser(userId: string): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ isApproved: true, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning();
    return user;
  },

  async deleteUserAccount(userId: string): Promise<{ success: boolean; error?: string; code?: string }> {
    try {
      const [merchant] = await db.select().from(merchants).where(eq(merchants.userId, userId));
      if (merchant) {
        console.log(`[Account Deletion] User ${userId} has merchant account, deletion blocked`);
        return { 
          success: false, 
          error: "您有商家身份，請先取消商家資格後再刪除帳號",
          code: "MERCHANT_ACCOUNT_EXISTS"
        };
      }
      
      await db.delete(userNotifications).where(eq(userNotifications.userId, userId));
      await db.delete(userDailyGachaStats).where(eq(userDailyGachaStats.userId, userId));
      
      await db.delete(userInventory).where(eq(userInventory.userId, userId));
      await db.delete(couponRedemptions).where(eq(couponRedemptions.userId, userId));
      
      await db.delete(collections).where(eq(collections.userId, userId));
      await db.delete(userLocations).where(eq(userLocations.userId, userId));
      await db.delete(placeFeedback).where(eq(placeFeedback.userId, userId));
      
      await db.delete(chatInvites).where(eq(chatInvites.inviterUserId, userId));
      await db.delete(chatInvites).where(eq(chatInvites.usedByUserId, userId));
      
      await db.delete(sosAlerts).where(eq(sosAlerts.userId, userId));
      await db.delete(sosEvents).where(eq(sosEvents.userId, userId));
      
      await db.delete(travelCompanions).where(eq(travelCompanions.userId, userId));
      
      await db.delete(serviceRelations).where(eq(serviceRelations.travelerId, userId));
      
      await db.delete(cartItems).where(eq(cartItems.userId, userId));
      await db.delete(serviceOrders).where(eq(serviceOrders.userId, userId));
      await db.delete(commerceOrders).where(eq(commerceOrders.userId, userId));
      
      await db.delete(planners).where(eq(planners.userId, userId));
      
      const userSpecialists = await db.select().from(specialists).where(eq(specialists.userId, userId));
      for (const specialist of userSpecialists) {
        await db.delete(serviceRelations).where(eq(serviceRelations.specialistId, specialist.id));
        await db.update(tripServicePurchases)
          .set({ specialistId: null })
          .where(eq(tripServicePurchases.specialistId, specialist.id));
      }
      await db.delete(specialists).where(eq(specialists.userId, userId));
      
      const userTripPlans = await db.select().from(tripPlans).where(eq(tripPlans.userId, userId));
      for (const plan of userTripPlans) {
        const planDays = await db.select().from(tripDays).where(eq(tripDays.tripPlanId, plan.id));
        for (const day of planDays) {
          await db.delete(tripActivities).where(eq(tripActivities.tripDayId, day.id));
        }
        await db.delete(tripDays).where(eq(tripDays.tripPlanId, plan.id));
      }
      await db.delete(tripPlans).where(eq(tripPlans.userId, userId));
      
      await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
      await db.delete(collectionReadStatus).where(eq(collectionReadStatus.userId, userId));
      
      await db.update(tripServicePurchases)
        .set({ purchasedForUserId: null })
        .where(eq(tripServicePurchases.purchasedForUserId, userId));
      await db.delete(tripServicePurchases).where(eq(tripServicePurchases.userId, userId));
      
      await db.delete(users).where(eq(users.id, userId));
      
      return { success: true };
    } catch (error) {
      console.error('Delete user account error:', error);
      return { 
        success: false, 
        error: "刪除帳號時發生錯誤",
        code: "DELETE_FAILED" 
      };
    }
  },

  // ============ Auth Identities ============
  
  async getAuthIdentity(provider: string, providerUserId: string): Promise<AuthIdentity | undefined> {
    const [identity] = await db
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerUserId, providerUserId)
        )
      );
    return identity || undefined;
  },

  async getAuthIdentitiesByUserId(userId: string): Promise<AuthIdentity[]> {
    return await db
      .select()
      .from(authIdentities)
      .where(eq(authIdentities.userId, userId));
  },

  async upsertAuthIdentity(data: InsertAuthIdentity): Promise<AuthIdentity> {
    const [identity] = await db
      .insert(authIdentities)
      .values(data)
      .onConflictDoUpdate({
        target: [authIdentities.provider, authIdentities.providerUserId],
        set: {
          userId: data.userId,
          email: data.email,
          emailVerified: data.emailVerified,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          tokenExpiresAt: data.tokenExpiresAt,
          updatedAt: new Date(),
        },
      })
      .returning();
    return identity;
  },

  async deleteAuthIdentity(provider: string, providerUserId: string): Promise<boolean> {
    const result = await db
      .delete(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, provider),
          eq(authIdentities.providerUserId, providerUserId)
        )
      );
    return true;
  },

  // ============ Notifications ============

  async getUnreadNotificationCount(userId: string, notificationType: string): Promise<number> {
    const [notification] = await db.select()
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.notificationType, notificationType)
      ));
    return notification?.unreadCount || 0;
  },

  async markNotificationsRead(userId: string, notificationType: string): Promise<void> {
    await db.update(userNotifications)
      .set({ unreadCount: 0, lastSeenAt: new Date() })
      .where(and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.notificationType, notificationType)
      ));
  },

  async incrementNotificationCount(userId: string, notificationType: string): Promise<void> {
    const [existing] = await db.select()
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, userId),
        eq(userNotifications.notificationType, notificationType)
      ));

    if (existing) {
      await db.update(userNotifications)
        .set({
          unreadCount: existing.unreadCount + 1,
          lastUpdatedAt: new Date(),
        })
        .where(eq(userNotifications.id, existing.id));
    } else {
      await db.insert(userNotifications).values({
        userId,
        notificationType,
        unreadCount: 1,
      });
    }
  },

  /**
   * 通知擁有特定景點圖鑑的所有用戶
   * 當商家更新優惠時調用
   */
  async notifyCollectionHolders(officialPlaceId: number): Promise<number> {
    // 找出所有擁有該景點圖鑑的用戶
    const holders = await db.select({ userId: collections.userId })
      .from(collections)
      .where(eq(collections.officialPlaceId, officialPlaceId))
      .groupBy(collections.userId);

    // 為每個用戶增加通知計數
    for (const holder of holders) {
      await userStorage.incrementNotificationCount(holder.userId, 'collection');
    }

    return holders.length;
  },
};
