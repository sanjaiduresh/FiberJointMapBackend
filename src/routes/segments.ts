import { Router, Response } from 'express';
import Segment from '../models/Segment';
import FiberJoint from '../models/FiberJoint';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// Haversine distance in meters
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// GET /api/segments — fetch all segments
router.get('/', async (_req: AuthRequest, res: Response) => {
  try {
    const segments = await Segment.find().sort({ createdAt: -1 });
    res.json(segments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
});

// POST /api/segments — create a segment between two joints (auth required)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { fromJointId, toJointId, cableType, fiberCount } = req.body;

    if (!fromJointId || !toJointId || !cableType || fiberCount == null) {
      res.status(400).json({ error: 'fromJointId, toJointId, cableType, fiberCount required' });
      return;
    }

    if (fromJointId === toJointId) {
      res.status(400).json({ error: 'Cannot connect a joint to itself' });
      return;
    }

    // Look up joints to calculate distance
    const [fromJoint, toJoint] = await Promise.all([
      FiberJoint.findById(fromJointId),
      FiberJoint.findById(toJointId),
    ]);

    if (!fromJoint || !toJoint) {
      res.status(404).json({ error: 'One or both joints not found' });
      return;
    }

    const lengthMeters = haversineMeters(fromJoint.lat, fromJoint.lng, toJoint.lat, toJoint.lng);

    const segment = await Segment.create({
      fromJointId,
      toJointId,
      cableType,
      fiberCount,
      lengthMeters: Math.round(lengthMeters * 100) / 100,
      createdBy: {
        userId: req.user!.userId,
        userName: req.user!.userName,
      },
    });

    res.status(201).json(segment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create segment' });
  }
});

// DELETE /api/segments/:id — delete segment (auth required)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Segment.findByIdAndDelete(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json({ message: 'Segment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete segment' });
  }
});

export default router;
