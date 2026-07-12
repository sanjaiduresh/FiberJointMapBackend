import { Router, Response } from 'express';
import Wire from '../models/Wire';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/wires — list all wires for the organization
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const wires = await Wire.find({ organizationId: req.user!.organizationId }).sort({ createdAt: -1 });
    res.json(wires);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch wires' });
  }
});

// POST /api/wires — create a new wire
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;

    if (!name || !color) {
      res.status(400).json({ error: 'name and color are required' });
      return;
    }

    const wire = await Wire.create({
      name: name.trim(),
      color,
      organizationId: req.user!.organizationId,
      createdBy: {
        userId: req.user!.userId,
        userName: req.user!.userName,
      },
    });

    res.status(201).json(wire);
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ error: 'A wire with that name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create wire' });
  }
});

// PUT /api/wires/:id — update a wire
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { name, color } = req.body;
    const wire = await Wire.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });

    if (!wire) {
      res.status(404).json({ error: 'Wire not found' });
      return;
    }

    if (name !== undefined) wire.name = name.trim();
    if (color !== undefined) wire.color = color;

    await wire.save();
    res.json(wire);
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(409).json({ error: 'A wire with that name already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to update wire' });
  }
});

// DELETE /api/wires/:id — delete a wire
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const wire = await Wire.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user!.organizationId,
    });

    if (!wire) {
      res.status(404).json({ error: 'Wire not found' });
      return;
    }

    res.json({ message: 'Wire deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete wire' });
  }
});

export default router;
