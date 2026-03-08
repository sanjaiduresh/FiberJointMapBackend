import { Router, Request, Response } from 'express';
import FiberJoint from '../models/FiberJoint';
import Segment from '../models/Segment';
import Cut from '../models/Cut';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/joints — fetch all joints (public)
router.get('/', async (_req: Request, res: Response) => {
  try {
    const joints = await FiberJoint.find().sort({ createdAt: -1 });
    res.json(joints);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch joints' });
  }
});

// POST /api/joints — create a new joint (auth required)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { label, notes, lat, lng, cableType, fiberCount } = req.body;

    if (!label || lat == null || lng == null) {
      res.status(400).json({ error: 'label, lat, and lng are required' });
      return;
    }

    const joint = await FiberJoint.create({
      label,
      notes: notes || '',
      cableType: cableType || 'Single Mode',
      fiberCount: fiberCount ?? 12,
      lat,
      lng,
      createdBy: {
        userId: req.user!.userId,
        userName: req.user!.userName,
      },
    });
    res.status(201).json(joint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create joint' });
  }
});

// DELETE /api/joints/:id — cascading delete (auth required)
// Deletes the joint + all connected segments + all cuts on those segments
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const joint = await FiberJoint.findById(req.params.id);
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    // Find all segments connected to this joint
    const segments = await Segment.find({
      $or: [{ fromJointId: req.params.id }, { toJointId: req.params.id }],
    });

    const segmentIds = segments.map((s) => s._id);

    // Delete all cuts on those segments
    if (segmentIds.length > 0) {
      await Cut.deleteMany({ segmentId: { $in: segmentIds } });
    }

    // Delete all connected segments
    await Segment.deleteMany({
      $or: [{ fromJointId: req.params.id }, { toJointId: req.params.id }],
    });

    // Delete the joint itself
    await FiberJoint.findByIdAndDelete(req.params.id);

    res.json({ message: 'Joint and related segments/cuts deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete joint' });
  }
});

export default router;
