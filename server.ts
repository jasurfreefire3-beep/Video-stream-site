import express from 'express';
import path from 'path';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import apiRoutes from './server/routes.js';
import { getDbPool } from './server/db.js';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads directory (for posters or static files)
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
app.use('/uploads', express.static(UPLOAD_DIR));

// API Routes
app.use('/api', apiRoutes);

async function startServer() {
  // Test and initialize MySQL connection
  try {
    await getDbPool();
    console.log('[App] Database initialized.');
  } catch (err) {
    console.error('[App] Database init warning:', err);
  }

  // Vite Middleware for Dev vs Production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Animem.uz Video CDN running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
