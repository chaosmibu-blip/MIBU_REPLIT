import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { storage } from './storage';
import { verifyJwtToken } from './replitAuth';

interface LocationUpdate {
  lat: number;
  lng: number;
  timestamp?: number;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

const userSocketMap = new Map<string, Set<string>>();
const specialistSocketMap = new Map<string, Set<string>>();

export function setupSocketIO(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin.endsWith('.replit.dev') || origin.endsWith('.replit.app') || origin.includes('localhost') || origin.includes('exp.host')) {
          return callback(null, true);
        }
        callback(null, true);
      },
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const decoded = verifyJwtToken(token);
      if (!decoded || !decoded.sub) {
        return next(new Error('Invalid token'));
      }

      socket.userId = decoded.sub;
      
      const user = await storage.getUser(decoded.sub);
      socket.userRole = user?.role || 'consumer';

      next();
    } catch (error) {
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId;
    const userRole = socket.userRole;

    if (!userId) {
      socket.disconnect();
      return;
    }

    console.log(`🔌 Socket connected: ${userId} (${userRole})`);

    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, new Set());
    }
    userSocketMap.get(userId)!.add(socket.id);

    if (userRole === 'specialist') {
      if (!specialistSocketMap.has(userId)) {
        specialistSocketMap.set(userId, new Set());
      }
      specialistSocketMap.get(userId)!.add(socket.id);
    }

    socket.on('location_update', async (data: LocationUpdate) => {
      try {
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number' || 
            Number.isNaN(data.lat) || Number.isNaN(data.lng)) {
          socket.emit('location_error', { error: 'Invalid coordinates' });
          return;
        }

        if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
          socket.emit('location_error', { error: 'Coordinates out of range' });
          return;
        }

        await storage.upsertUserLocation(userId, data.lat, data.lng, true);

        const activeService = await storage.getActiveServiceRelationByTraveler(userId);
        
        if (activeService) {
          const specialist = await storage.getSpecialistById(activeService.specialistId);
          
          if (specialist) {
            const specialistUserId = specialist.userId;
            const specialistSockets = specialistSocketMap.get(specialistUserId);
            
            if (specialistSockets && specialistSockets.size > 0) {
              const locationPayload = {
                travelerId: userId,
                serviceId: activeService.id,
                lat: data.lat,
                lng: data.lng,
                timestamp: data.timestamp || Date.now(),
              };

              specialistSockets.forEach(socketId => {
                io.to(socketId).emit('traveler_location', locationPayload);
              });

              console.log(`📍 Location forwarded: ${userId} → Specialist ${specialistUserId}`);
            }
          }
        }

        socket.emit('location_ack', { 
          success: true, 
          timestamp: Date.now(),
          serviceActive: !!activeService 
        });

      } catch (error) {
        console.error('Location update error:', error);
        socket.emit('location_error', { error: 'Failed to process location' });
      }
    });

    socket.on('specialist_subscribe', async (data: { serviceId?: number }) => {
      if (userRole !== 'specialist') {
        socket.emit('subscribe_error', { error: 'Only specialists can subscribe' });
        return;
      }

      try {
        const specialist = await storage.getSpecialistByUserId(userId);
        if (!specialist) {
          socket.emit('subscribe_error', { error: 'Specialist profile not found' });
          return;
        }

        const activeRelations = await storage.getActiveServiceRelationsBySpecialist(specialist.id);
        
        socket.emit('active_travelers', {
          count: activeRelations.length,
          travelers: activeRelations.map(r => ({
            serviceId: r.id,
            travelerId: r.travelerId,
            region: r.region,
            createdAt: r.createdAt,
          }))
        });

        console.log(`👀 Specialist ${userId} subscribed to ${activeRelations.length} travelers`);

      } catch (error) {
        console.error('Specialist subscribe error:', error);
        socket.emit('subscribe_error', { error: 'Failed to subscribe' });
      }
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${userId}`);
      
      const userSockets = userSocketMap.get(userId);
      if (userSockets) {
        userSockets.delete(socket.id);
        if (userSockets.size === 0) {
          userSocketMap.delete(userId);
        }
      }

      if (userRole === 'specialist') {
        const specialistSockets = specialistSocketMap.get(userId);
        if (specialistSockets) {
          specialistSockets.delete(socket.id);
          if (specialistSockets.size === 0) {
            specialistSocketMap.delete(userId);
          }
        }
      }
    });
  });

  console.log('🚀 Socket.IO initialized for real-time location tracking');
  
  return io;
}

export function getConnectedUsers(): string[] {
  return Array.from(userSocketMap.keys());
}

export function isUserOnline(userId: string): boolean {
  return userSocketMap.has(userId) && userSocketMap.get(userId)!.size > 0;
}
