import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import authRoutes from './routes/auth';
import farmRoutes from './routes/farms';
import aiRoutes from './routes/ai';
import diseaseRoutes from './routes/disease';
import marketRoutes from './routes/markets';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/farms', farmRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/disease', diseaseRoutes);
app.use('/api/v1/markets', marketRoutes);

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`KrishiMitra-AI backend running on port ${PORT}`);
  });
}

export default app;
