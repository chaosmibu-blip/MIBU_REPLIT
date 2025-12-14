import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from './prisma';
import { generateJwtToken, verifyJwtToken } from './replitAuth';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1),
  role: z.enum(['CONSUMER', 'PLANNER', 'MERCHANT']).optional().default('CONSUMER'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/register', async (req, res) => {
  try {
    const data = registerSchema.parse(req.body);
    
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });
    
    if (existingUser) {
      return res.status(400).json({ error: '此 Email 已被註冊' });
    }
    
    const passwordHash = await bcrypt.hash(data.password, 10);
    
    const user = await prisma.user.create({
      data: {
        email: data.email,
        passwordHash,
        role: data.role,
        consumerProfile: data.role === 'CONSUMER' ? {
          create: { name: data.name },
        } : undefined,
        plannerProfile: data.role === 'PLANNER' ? {
          create: { name: data.name, region: '' },
        } : undefined,
        merchantProfile: data.role === 'MERCHANT' ? {
          create: { businessName: data.name, address: '' },
        } : undefined,
      },
      include: {
        consumerProfile: true,
        plannerProfile: true,
        merchantProfile: true,
      },
    });
    
    const token = generateJwtToken({
      id: user.id,
      email: user.email,
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.consumerProfile || user.plannerProfile || user.merchantProfile,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: '註冊失敗' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const data = loginSchema.parse(req.body);
    
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: {
        consumerProfile: true,
        plannerProfile: true,
        merchantProfile: true,
      },
    });
    
    if (!user) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    
    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    
    if (!isValid) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    
    if (!user.isActive) {
      return res.status(403).json({ error: '帳號已停用' });
    }
    
    const token = generateJwtToken({
      id: user.id,
      email: user.email,
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: user.consumerProfile || user.plannerProfile || user.merchantProfile,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error('Login error:', error);
    res.status(500).json({ error: '登入失敗' });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登入' });
  }
  
  const token = authHeader.substring(7);
  const decoded = verifyJwtToken(token);
  
  if (!decoded) {
    return res.status(401).json({ error: 'Token 無效或已過期' });
  }
  
  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      include: {
        consumerProfile: true,
        plannerProfile: true,
        merchantProfile: true,
      },
    });
    
    if (!user) {
      return res.status(404).json({ error: '找不到使用者' });
    }
    
    res.json({
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      profile: user.consumerProfile || user.plannerProfile || user.merchantProfile,
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: '取得使用者資料失敗' });
  }
});

export const authRoutes = router;
