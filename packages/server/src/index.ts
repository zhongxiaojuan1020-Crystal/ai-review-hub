import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fastifyJwt from '@fastify/jwt';
import { getConfig } from './config.js';
import { authRoutes } from './routes/auth.js';
import { reviewRoutes } from './routes/reviews.js';
import { scoreRoutes } from './routes/scores.js';
import { commentRoutes } from './routes/comments.js';
import { rankingRoutes } from './routes/ranking.js';
import { distributeRoutes } from './routes/distribute.js';
import { guestRoutes } from './routes/guest.js';
import { userRoutes } from './routes/users.js';
import { configRoutes } from './routes/config.js';
import { aiRoutes } from './routes/ai.js';
import { draftRoutes } from './routes/drafts.js';
import { favoriteRoutes } from './routes/favorites.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = getConfig();

// Ensure data directory exists
const dataDir = path.dirname(config.databasePath);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}


const app = Fastify({ logger: true, bodyLimit: 50 * 1024 * 1024 });

// CORS for dev
await app.register(cors, { origin: true, credentials: true });

// JWT
await app.register(fastifyJwt, { secret: config.jwtSecret });

// Auth decorator
app.decorate('authenticate', async function (request: any, reply: any) {
  try {
    await request.jwtVerify();
  } catch (err) {
    reply.status(401).send({ error: 'Unauthorized' });
  }
});

// Register routes
await app.register(authRoutes);
await app.register(reviewRoutes);
await app.register(scoreRoutes);
await app.register(commentRoutes);
await app.register(rankingRoutes);
await app.register(distributeRoutes);
await app.register(guestRoutes);
await app.register(userRoutes);
await app.register(configRoutes);
await app.register(aiRoutes);
await app.register(draftRoutes);
await app.register(favoriteRoutes);

// Serve static frontend in production
const publicDir = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir, prefix: '/' });
  // SPA fallback
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.status(404).send({ error: 'Not found' });
    }
    return reply.sendFile('index.html');
  });
}

// Start
try {
  await app.listen({ port: config.port, host: config.host });
  console.log(`Server running at http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
