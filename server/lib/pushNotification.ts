import { storage } from "../storage";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
  ttl?: number;
}

interface ExpoPushTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: Record<string, unknown>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  const user = await storage.getUser(userId);
  if (!user?.expoPushToken) {
    return { success: false, error: "User has no push token" };
  }

  const message: ExpoPushMessage = {
    to: user.expoPushToken,
    title,
    body,
    sound: "default",
    priority: "high",
    data,
  };

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(message),
    });

    const result = await response.json();
    const ticket = result.data as ExpoPushTicket;

    if (ticket.status === "ok" && ticket.id) {
      return { success: true, ticketId: ticket.id };
    } else {
      return { success: false, error: ticket.message || "Push failed" };
    }
  } catch (error) {
    console.error("Push notification error:", error);
    return { success: false, error: String(error) };
  }
}

export async function sendBulkPushNotifications(
  userIds: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ sent: number; failed: number; tickets: string[] }> {
  const messages: ExpoPushMessage[] = [];
  
  for (const userId of userIds) {
    const user = await storage.getUser(userId);
    if (user?.expoPushToken) {
      messages.push({
        to: user.expoPushToken,
        title,
        body,
        sound: "default",
        priority: "high",
        data,
      });
    }
  }

  if (messages.length === 0) {
    return { sent: 0, failed: userIds.length, tickets: [] };
  }

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await response.json();
    const tickets = result.data as ExpoPushTicket[];

    const successTickets = tickets
      .filter((t) => t.status === "ok" && t.id)
      .map((t) => t.id!);
    const failedCount = tickets.filter((t) => t.status === "error").length;

    return {
      sent: successTickets.length,
      failed: failedCount + (userIds.length - messages.length),
      tickets: successTickets,
    };
  } catch (error) {
    console.error("Bulk push notification error:", error);
    return { sent: 0, failed: userIds.length, tickets: [] };
  }
}

export async function checkPushReceipts(
  ticketIds: string[]
): Promise<Record<string, ExpoPushReceipt>> {
  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ ids: ticketIds }),
    });

    const result = await response.json();
    return result.data as Record<string, ExpoPushReceipt>;
  } catch (error) {
    console.error("Check receipts error:", error);
    return {};
  }
}

export type NotificationType =
  | "itinerary_ready"
  | "coupon_received"
  | "merchant_approved"
  | "order_update"
  | "sos_alert"
  | "chat_message"
  | "system";

export async function sendTypedNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  extraData?: Record<string, unknown>
): Promise<{ success: boolean; ticketId?: string; error?: string }> {
  return sendPushNotification(userId, title, body, {
    type,
    ...extraData,
  });
}
