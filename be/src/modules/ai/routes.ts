import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { parse, requireUser } from '../../lib/http';
import { aiStatus, createAiPlaylist, refineAiPlaylist, SUGGESTIONS } from './service';

export const aiRouter = Router();

// Burst protection on top of the daily quota (each request may call Gemini).
const burst = rateLimit({ windowMs: 60_000, limit: 6, standardHeaders: 'draft-8', legacyHeaders: false });
const promptBody = z.object({ prompt: z.string().trim().min(3).max(300) });
const localeOf = (v: unknown): 'vi' | 'en' => (v === 'en' ? 'en' : 'vi');

aiRouter.get('/ai/status', async (req, res) => {
  const status = await aiStatus(requireUser(req));
  res.json({ ...status, suggestions: SUGGESTIONS[localeOf(req.header('x-locale'))] });
});

aiRouter.post('/ai/playlist', burst, async (req, res) => {
  const userId = requireUser(req);
  const { prompt } = parse(promptBody, req.body);
  res.status(201).json(await createAiPlaylist(userId, prompt, localeOf(req.header('x-locale'))));
});

aiRouter.post('/ai/playlist/:id/refine', burst, async (req, res) => {
  const userId = requireUser(req);
  const { id } = parse(z.object({ id: z.guid() }), req.params);
  const { prompt } = parse(promptBody, req.body);
  res.json(await refineAiPlaylist(userId, id, prompt, localeOf(req.header('x-locale'))));
});
