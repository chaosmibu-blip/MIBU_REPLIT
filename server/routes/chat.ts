import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import twilio from "twilio";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const { AccessToken } = twilio.jwt;
const ChatGrant = AccessToken.ChatGrant;
const VoiceGrant = AccessToken.VoiceGrant;

const router = Router();

router.get("/chat/token", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
      console.error("Missing Twilio credentials");
      return res.status(500).json(createErrorResponse(ErrorCode.CHAT_NOT_CONFIGURED));
    }

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: userId,
      ttl: 3600
    });

    const chatGrant = new ChatGrant({
      serviceSid: conversationsServiceSid
    });
    token.addGrant(chatGrant);

    res.json({ 
      token: token.toJwt(),
      identity: userId
    });
  } catch (error) {
    console.error("Twilio token error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法產生聊天 Token'));
  }
});

router.post("/chat/conversations", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { friendlyName, uniqueName } = req.body;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
      return res.status(500).json(createErrorResponse(ErrorCode.CHAT_NOT_CONFIGURED));
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });

    const conversation = await client.conversations.v1
      .services(conversationsServiceSid)
      .conversations
      .create({
        friendlyName: friendlyName || `Trip Chat ${Date.now()}`,
        uniqueName: uniqueName || `trip_${Date.now()}_${userId.slice(0, 8)}`
      });

    await client.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversation.sid)
      .participants
      .create({ identity: userId });

    res.json({ 
      conversationSid: conversation.sid,
      friendlyName: conversation.friendlyName
    });
  } catch (error: any) {
    console.error("Create conversation error:", error);
    if (error.code === 50433) {
      return res.status(409).json(createErrorResponse(ErrorCode.ALREADY_ACTIVE, '對話已存在'));
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法建立對話'));
  }
});

router.get("/chat/conversations", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
      return res.status(500).json(createErrorResponse(ErrorCode.CHAT_NOT_CONFIGURED));
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });

    const participants = await client.conversations.v1
      .services(conversationsServiceSid)
      .participantConversations
      .list({ identity: userId, limit: 50 });

    const conversations = participants.map((p: any) => ({
      conversationSid: p.conversationSid,
      friendlyName: p.conversationFriendlyName,
      state: p.conversationState,
      unreadMessagesCount: p.unreadMessagesCount || 0
    }));

    res.json({ conversations });
  } catch (error) {
    console.error("List conversations error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得對話列表'));
  }
});

router.post("/chat/conversations/:conversationSid/join", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { conversationSid } = req.params;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
      return res.status(500).json(createErrorResponse(ErrorCode.CHAT_NOT_CONFIGURED));
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });

    await client.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversationSid)
      .participants
      .create({ identity: userId });

    res.json({ success: true });
  } catch (error: any) {
    console.error("Join conversation error:", error);
    if (error.code === 50433) {
      return res.json({ success: true, message: "Already a participant" });
    }
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法加入對話'));
  }
});

router.delete("/chat/conversations/:conversationSid", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { conversationSid } = req.params;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
      return res.status(500).json(createErrorResponse(ErrorCode.CHAT_NOT_CONFIGURED));
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });

    await client.conversations.v1
      .services(conversationsServiceSid)
      .conversations(conversationSid)
      .remove();

    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete conversation error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, error.message || '無法刪除對話'));
  }
});

router.post("/chat/conversations/:conversationSid/call", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { conversationSid } = req.params;
    
    const roomName = `mibu-${conversationSid.replace(/[^a-zA-Z0-9]/g, '')}`;
    const callUrl = `https://meet.jit.si/${roomName}`;

    res.json({ 
      success: true,
      callUrl,
      roomName
    });
  } catch (error: any) {
    console.error("Start call error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, error.message || '無法開始通話'));
  }
});

router.get("/token", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;
    const twimlAppSid = process.env.TWILIO_TWIML_APP_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret) {
      console.error("Missing Twilio credentials");
      return res.status(500).json(createErrorResponse(ErrorCode.TWILIO_NOT_CONFIGURED));
    }

    const identity = userId;

    const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
      identity: identity,
      ttl: 3600
    });

    if (conversationsServiceSid) {
      const chatGrant = new ChatGrant({
        serviceSid: conversationsServiceSid
      });
      token.addGrant(chatGrant);
    }

    if (twimlAppSid) {
      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: twimlAppSid,
        incomingAllow: true
      });
      token.addGrant(voiceGrant);
    }

    res.json({ 
      token: token.toJwt(),
      identity: identity
    });
  } catch (error) {
    console.error("Twilio unified token error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法產生 Token'));
  }
});

router.post("/voice/connect", (req, res) => {
  const { To } = req.body;
  const voiceResponse = new twilio.twiml.VoiceResponse();

  if (To) {
    const callerId = process.env.TWILIO_CALLER_ID;
    const dial = voiceResponse.dial({ callerId: callerId || undefined });
    dial.client(To);
  } else {
    voiceResponse.say("Invalid connection target.");
  }

  res.type('text/xml');
  res.send(voiceResponse.toString());
});

router.post("/chat/conversations/:conversationSid/invite-link", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { conversationSid } = req.params;
    
    const inviteCode = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await storage.createChatInvite({
      conversationSid,
      inviterUserId: userId,
      status: 'pending',
      expiresAt,
    }, inviteCode);

    const baseUrl = process.env.REPL_SLUG 
      ? `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER?.toLowerCase()}.repl.co`
      : 'http://localhost:5000';
    
    const inviteLink = `${baseUrl}/chat/join/${inviteCode}`;

    res.json({ 
      inviteLink,
      inviteCode,
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    console.error("Generate invite link error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法產生邀請連結'));
  }
});

router.post("/chat/invites/:inviteCode/accept", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { inviteCode } = req.params;
    
    const invite = await storage.getChatInviteByCode(inviteCode);
    if (!invite) {
      return res.status(404).json(createErrorResponse(ErrorCode.INVITE_NOT_FOUND));
    }

    if (invite.status !== 'pending') {
      return res.status(400).json(createErrorResponse(ErrorCode.INVITE_ALREADY_USED));
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVITE_EXPIRED));
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const apiKeySid = process.env.TWILIO_API_KEY_SID;
    const apiKeySecret = process.env.TWILIO_API_KEY_SECRET;
    const conversationsServiceSid = process.env.TWILIO_CONVERSATIONS_SERVICE_SID;

    if (!accountSid || !apiKeySid || !apiKeySecret || !conversationsServiceSid) {
      return res.status(500).json(createErrorResponse(ErrorCode.CHAT_NOT_CONFIGURED));
    }

    const client = twilio(apiKeySid, apiKeySecret, { accountSid });

    try {
      await client.conversations.v1
        .services(conversationsServiceSid)
        .conversations(invite.conversationSid)
        .participants
        .create({ identity: userId });
    } catch (err: any) {
      if (err.code !== 50433) {
        throw err;
      }
    }

    await storage.updateChatInvite(invite.id, {
      status: 'accepted',
      usedByUserId: userId,
    });

    res.json({ 
      success: true,
      conversationSid: invite.conversationSid
    });
  } catch (error) {
    console.error("Accept invite error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法接受邀請'));
  }
});

router.post("/klook/detect", isAuthenticated, async (req: any, res) => {
  try {
    const { messageText, conversationSid, messageSid } = req.body;
    
    if (!messageText || !conversationSid || !messageSid) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '缺少必要欄位: messageText, conversationSid, messageSid'));
    }

    const { detectKlookProducts } = await import("../klookService");
    const result = await detectKlookProducts(messageText, conversationSid, messageSid);
    
    res.json({ 
      success: true,
      products: result.products
    });
  } catch (error) {
    console.error("Klook detection error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法偵測產品'));
  }
});

router.get("/klook/highlights/:conversationSid/:messageSid", isAuthenticated, async (req: any, res) => {
  try {
    const { conversationSid, messageSid } = req.params;
    
    const { getMessageHighlights } = await import("../klookService");
    const highlights = await getMessageHighlights(conversationSid, messageSid);
    
    res.json({ highlights });
  } catch (error) {
    console.error("Get highlights error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得重點資訊'));
  }
});

router.get("/klook/highlights/:conversationSid", isAuthenticated, async (req: any, res) => {
  try {
    const { conversationSid } = req.params;
    
    const { getConversationHighlights } = await import("../klookService");
    const highlights = await getConversationHighlights(conversationSid);
    
    res.json({ highlights });
  } catch (error) {
    console.error("Get conversation highlights error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得重點資訊'));
  }
});

router.post("/feedback/exclude", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    const { placeName, district, city, placeCacheId } = req.body;
    
    if (!placeName || !district || !city) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '缺少必要欄位: placeName, district, city'));
    }

    const feedback = await storage.incrementPlacePenalty(
      userId,
      placeName,
      district,
      city,
      placeCacheId || undefined
    );

    res.json({
      success: true,
      message: `Place "${placeName}" has been excluded`,
      feedback: {
        id: feedback.id,
        placeName: feedback.placeName,
        penaltyScore: feedback.penaltyScore
      }
    });
  } catch (error) {
    console.error("Feedback exclusion error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法排除景點'));
  }
});

export default router;
