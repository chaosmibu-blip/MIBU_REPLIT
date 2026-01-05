import { db } from "../db";
import { eq, and, ilike, desc } from "drizzle-orm";
import {
  chatInvites,
  cartItems,
  commerceOrders,
  klookProducts,
  messageHighlights,
  placeProducts,
  type ChatInvite,
  type CartItem,
  type InsertCartItem,
  type CommerceOrder,
  type InsertCommerceOrder,
  type KlookProduct,
  type InsertKlookProduct,
  type MessageHighlight,
  type InsertMessageHighlight,
  type PlaceProduct,
} from "@shared/schema";

export const commerceStorage = {
  // Chat Invites
  async createChatInvite(
    invite: { conversationSid: string; inviterUserId: string; status: string; expiresAt: Date },
    inviteCode: string
  ): Promise<ChatInvite> {
    const [created] = await db
      .insert(chatInvites)
      .values({
        ...invite,
        inviteCode,
      })
      .returning();
    return created;
  },

  async getChatInviteByCode(inviteCode: string): Promise<ChatInvite | undefined> {
    const [invite] = await db
      .select()
      .from(chatInvites)
      .where(eq(chatInvites.inviteCode, inviteCode));
    return invite;
  },

  async updateChatInvite(
    inviteId: number,
    data: { status?: string; usedByUserId?: string }
  ): Promise<ChatInvite> {
    const [updated] = await db
      .update(chatInvites)
      .set(data)
      .where(eq(chatInvites.id, inviteId))
      .returning();
    return updated;
  },

  // Commerce - Cart
  async getCartItems(userId: string): Promise<Array<CartItem & { product: PlaceProduct }>> {
    const items = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
    const result: Array<CartItem & { product: PlaceProduct }> = [];
    for (const item of items) {
      const [product] = await db.select().from(placeProducts).where(eq(placeProducts.id, item.productId));
      if (product) {
        result.push({ ...item, product });
      }
    }
    return result;
  },

  async addToCart(item: InsertCartItem): Promise<CartItem> {
    const existing = await db.select().from(cartItems).where(
      and(eq(cartItems.userId, item.userId), eq(cartItems.productId, item.productId))
    );
    if (existing.length > 0) {
      const [updated] = await db.update(cartItems)
        .set({ quantity: existing[0].quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existing[0].id))
        .returning();
      return updated;
    }
    const [created] = await db.insert(cartItems).values(item).returning();
    return created;
  },

  async updateCartItemQuantity(cartItemId: number, quantity: number): Promise<CartItem> {
    const [updated] = await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, cartItemId)).returning();
    return updated;
  },

  async removeFromCart(cartItemId: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.id, cartItemId));
  },

  async clearCart(userId: string): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  },

  // Commerce - Orders
  async createOrder(order: InsertCommerceOrder): Promise<CommerceOrder> {
    const [created] = await db.insert(commerceOrders).values(order).returning();
    return created;
  },

  async getOrderById(orderId: number): Promise<CommerceOrder | undefined> {
    const [order] = await db.select().from(commerceOrders).where(eq(commerceOrders.id, orderId));
    return order;
  },

  async getOrderBySessionId(sessionId: string): Promise<CommerceOrder | undefined> {
    const [order] = await db.select().from(commerceOrders).where(eq(commerceOrders.stripeSessionId, sessionId));
    return order;
  },

  async updateOrderStatus(orderId: number, status: string, sessionId?: string): Promise<CommerceOrder> {
    const updateData: Partial<CommerceOrder> = { status, updatedAt: new Date() };
    if (sessionId) updateData.stripeSessionId = sessionId;
    const [updated] = await db.update(commerceOrders).set(updateData).where(eq(commerceOrders.id, orderId)).returning();
    return updated;
  },

  async getUserOrders(userId: string): Promise<CommerceOrder[]> {
    return db.select().from(commerceOrders).where(eq(commerceOrders.userId, userId)).orderBy(desc(commerceOrders.createdAt));
  },

  // Klook Products
  async searchKlookProducts(query: string): Promise<KlookProduct[]> {
    const normalized = query.toLowerCase().replace(/\s+/g, '');
    return db.select().from(klookProducts)
      .where(and(
        ilike(klookProducts.nameNormalized, `%${normalized}%`),
        eq(klookProducts.isActive, true)
      ))
      .limit(10);
  },

  async getKlookProductByName(normalizedName: string): Promise<KlookProduct | undefined> {
    const [product] = await db.select().from(klookProducts)
      .where(eq(klookProducts.nameNormalized, normalizedName));
    return product;
  },

  async createKlookProduct(product: InsertKlookProduct): Promise<KlookProduct> {
    const [created] = await db.insert(klookProducts).values(product).returning();
    return created;
  },

  // Message Highlights
  async getMessageHighlights(conversationSid: string, messageSid: string): Promise<MessageHighlight[]> {
    return db.select().from(messageHighlights)
      .where(and(
        eq(messageHighlights.conversationSid, conversationSid),
        eq(messageHighlights.messageSid, messageSid)
      ));
  },

  async createMessageHighlight(highlight: InsertMessageHighlight): Promise<MessageHighlight> {
    const [created] = await db.insert(messageHighlights).values(highlight).returning();
    return created;
  },

  async getConversationHighlights(conversationSid: string): Promise<MessageHighlight[]> {
    return db.select().from(messageHighlights)
      .where(eq(messageHighlights.conversationSid, conversationSid));
  },
};
