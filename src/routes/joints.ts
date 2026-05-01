import { Router, Response } from 'express';
import FiberJoint from '../models/FiberJoint';
import Segment from '../models/Segment';
import Cut from '../models/Cut';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/joints
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const joints = await FiberJoint.find({ userId: req.user!.userId }).sort({ createdAt: -1 });
    res.json(joints);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch joints' });
  }
});

// POST /api/joints
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { label, notes, lat, lng, cableType, fiberCount, jointType } = req.body;

    if (!label || lat == null || lng == null) {
      res.status(400).json({ error: 'label, lat, and lng are required' });
      return;
    }

    const joint = await FiberJoint.create({
      label,
      notes: notes || '',
      jointType: jointType || 'Main',
      cableType: cableType || 'Single Mode',
      fiberCount: fiberCount ?? 12,
      lat, lng,
      userId: req.user!.userId,
      createdBy: { userId: req.user!.userId, userName: req.user!.userName },
    });
    res.status(201).json(joint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create joint' });
  }
});

// DELETE /api/joints/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const joint = await FiberJoint.findOne({ _id: req.params.id, userId: req.user!.userId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    // Find all segments connected to this joint
    const connectedSegments = await Segment.find({
      userId: req.user!.userId,
      $or: [{ fromJointId: req.params.id }, { toJointId: req.params.id }],
    });

    // ── Splice merge ─────────────────────────────────────────────────────────
    // If this is a Splice joint with exactly 2 segments, merge them back into
    // one continuous segment instead of leaving a gap in the network.
    if (joint.jointType === 'Splice' && connectedSegments.length === 2) {
      const [segA, segB] = connectedSegments;
      const spliceId = req.params.id;

      // Determine the "outer" endpoint of each segment
      // (the end that is NOT the splice joint)
      const outerA = segA.fromJointId.toString() === spliceId
        ? segA.toJointId
        : segA.fromJointId;

      const outerB = segB.fromJointId.toString() === spliceId
        ? segB.toJointId
        : segB.fromJointId;

      // Orient segA waypoints so they run outerA → splice
      // If segA.fromJointId === outerA, waypoints are already in the right order.
      // If segA.toJointId === outerA (i.e. the segment was stored as splice→outerA), reverse.
      const waypointsA: Array<{ lat: number; lng: number }> =
        segA.fromJointId.toString() === outerA.toString()
          ? segA.waypoints ?? []
          : [...(segA.waypoints ?? [])].reverse();

      // Orient segB waypoints so they run splice → outerB
      // If segB.fromJointId === spliceId, waypoints are already in the right order.
      const waypointsB: Array<{ lat: number; lng: number }> =
        segB.fromJointId.toString() === spliceId
          ? segB.waypoints ?? []
          : [...(segB.waypoints ?? [])].reverse();

      // Merged segment: outerA → [...waypointsA, ...waypointsB] → outerB
      await Segment.create({
        fromJointId: outerA,
        toJointId: outerB,
        cableType: segA.cableType,
        fiberCount: segA.fiberCount,
        waypoints: [...waypointsA, ...waypointsB],
        lengthMeters: (segA.lengthMeters ?? 0) + (segB.lengthMeters ?? 0),
        userId: req.user!.userId,
        createdBy: { userId: req.user!.userId, userName: req.user!.userName },
      });

      // Delete cuts on both old segments
      await Cut.deleteMany({
        segmentId: { $in: [segA._id, segB._id] },
        userId: req.user!.userId,
      });

      // Delete the two original segments
      await Segment.deleteMany({ _id: { $in: [segA._id, segB._id] } });

    } else {
      // ── Normal delete: cascade segments + cuts ──────────────────────────
      const segmentIds = connectedSegments.map((s) => s._id);

      if (segmentIds.length > 0) {
        await Cut.deleteMany({ segmentId: { $in: segmentIds }, userId: req.user!.userId });
        await Segment.deleteMany({ _id: { $in: segmentIds }, userId: req.user!.userId });
      }
    }

    // Delete the joint itself
    await FiberJoint.findByIdAndDelete(req.params.id);

    res.json({ message: 'Joint deleted', merged: joint.jointType === 'Splice' && connectedSegments.length === 2 });
  } catch (err) {
    console.error('Delete joint error:', err);
    res.status(500).json({ error: 'Failed to delete joint' });
  }
});

// GET /api/joints/base
router.get('/base', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const base = await FiberJoint.findOne({ userId: req.user!.userId, jointType: 'Base' });
    res.json(base || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch base joint' });
  }
});

export default router;