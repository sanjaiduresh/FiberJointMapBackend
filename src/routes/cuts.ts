import { Router, Response } from 'express';
import Cut from '../models/Cut';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/cuts — fetch cuts for the authenticated user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cuts = await Cut.find({ userId: req.user!.userId }).sort({ createdAt: -1 });
    res.json(cuts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch cuts' });
  }
});

// POST /api/cuts — create a new cut (auth required)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { lat, lng, severity, description, segmentId } = req.body;

    if (lat == null || lng == null || !severity || !segmentId) {
      res.status(400).json({ error: 'lat, lng, severity, and segmentId are required' });
      return;
    }

    const cut = await Cut.create({
      lat,
      lng,
      severity,
      description: description || '',
      segmentId,
      userId: req.user!.userId,
      markedBy: {
        userId: req.user!.userId,
        userName: req.user!.userName,
      },
    });

    res.status(201).json(cut);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create cut' });
  }
});

// PATCH /api/cuts/:id/fix — mark cut as fixed (auth required, user-scoped)
router.patch('/:id/fix', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const cut = await Cut.findOneAndUpdate(
      { _id: req.params.id, userId: req.user!.userId },
      {
        status: 'Fixed',
        fixedBy: {
          userId: req.user!.userId,
          userName: req.user!.userName,
        },
        fixedAt: new Date(),
      },
      { new: true }
    );

    if (!cut) {
      res.status(404).json({ error: 'Cut not found' });
      return;
    }

    res.json(cut);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fix cut' });
  }
});

// DELETE /api/cuts/:id — delete cut (auth required, user-scoped)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Cut.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
    if (!deleted) {
      res.status(404).json({ error: 'Cut not found' });
      return;
    }
    res.json({ message: 'Cut deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete cut' });
  }
});

export default router;
