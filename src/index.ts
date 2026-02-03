import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Bindings } from './types';
import { handleCheckHost } from './handlers/hostHandler';

const app = new Hono<{ Bindings: Bindings }>();

// Version: 2026-02-03-15:06 - Verified push to Steven-GlobalDots

app.use('/api/*', cors());

app.post('/api/check-host', handleCheckHost);

app.delete('/api/results', async (c) => {
  try {
    await c.env.hosts_db.prepare('DELETE FROM hosts').run();
    return c.json({ success: true, message: 'All records cleared' });
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/api/results', async (c) => {
  const results = await c.env.hosts_db.prepare('SELECT * FROM hosts ORDER BY updated_at DESC').all();
  return c.json(results.results);
});

export default app;
