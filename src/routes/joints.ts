import { Router, Request, Response } from 'express';
import FiberJoint from '../models/FiberJoint';

const router = Router();

// GET /api/joints — fetch all joints
router.get('/', async (_req: Request, res: Response) => {
  try {
    const joints = await FiberJoint.find().sort({ createdAt: -1 });
    res.json(joints);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch joints' });
  }
});

// POST /api/joints — create a new joint
router.post('/', async (req: Request, res: Response) => {
  try {
    const { label, notes, lat, lng } = req.body;

    if (!label || lat == null || lng == null) {
      res.status(400).json({ error: 'label, lat, and lng are required' });
      return;
    }

    const joint = await FiberJoint.create({ label, notes, lat, lng });
    res.status(201).json(joint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create joint' });
  }
});

// DELETE /api/joints/:id — delete joint by ID
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await FiberJoint.findByIdAndDelete(req.params.id);

    if (!deleted) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    res.json({ message: 'Joint deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete joint' });
  }
});

export default router;
