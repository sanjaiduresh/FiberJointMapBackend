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

// GET /api/segments — fetch segments for the authenticated user
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const segments = await Segment.find({ userId: req.user!.userId }).sort({ createdAt: -1 });
    res.json(segments);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch segments' });
  }
});

// POST /api/segments — create a segment between two joints (auth required)
router.post('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { fromJointId, toJointId, cableType, fiberCount, waypoints, lengthMeters } = req.body;

    if (!fromJointId || !toJointId || !cableType || fiberCount == null) {
      res.status(400).json({ error: 'fromJointId, toJointId, cableType, fiberCount required' });
      return;
    }

    if (fromJointId === toJointId) {
      res.status(400).json({ error: 'Cannot connect a joint to itself' });
      return;
    }

    // Look up joints (must belong to this user)
    const [fromJoint, toJoint] = await Promise.all([
      FiberJoint.findOne({ _id: fromJointId, userId: req.user!.userId }),
      FiberJoint.findOne({ _id: toJointId, userId: req.user!.userId }),
    ]);

    if (!fromJoint || !toJoint) {
      res.status(404).json({ error: 'One or both joints not found' });
      return;
    }

    // Valid waypoints array (default to empty)
    const validWaypoints: Array<{ lat: number; lng: number }> = Array.isArray(waypoints)
      ? waypoints.filter((w: any) => typeof w.lat === 'number' && typeof w.lng === 'number')
      : [];

    // Auto-calculate route distance through all waypoints
    const routePoints = [
      { lat: fromJoint.lat, lng: fromJoint.lng },
      ...validWaypoints,
      { lat: toJoint.lat, lng: toJoint.lng },
    ];
    let autoDistance = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
      autoDistance += haversineMeters(
        routePoints[i].lat, routePoints[i].lng,
        routePoints[i + 1].lat, routePoints[i + 1].lng,
      );
    }
    autoDistance = Math.round(autoDistance * 100) / 100;

    // Use user-provided length if given, otherwise auto-calculated
    const finalLength = typeof lengthMeters === 'number' && lengthMeters > 0
      ? Math.round(lengthMeters * 100) / 100
      : autoDistance;

    const segment = await Segment.create({
      fromJointId,
      toJointId,
      waypoints: validWaypoints,
      cableType,
      fiberCount,
      lengthMeters: finalLength,
      userId: req.user!.userId,
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

// DELETE /api/segments/:id — delete segment (auth required, user-scoped)
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Segment.findOneAndDelete({ _id: req.params.id, userId: req.user!.userId });
    if (!deleted) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json({ message: 'Segment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete segment' });
  }
});
router.post('/:id/splice', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { label, notes, jointType, cableType, fiberCount, lat, lng } = req.body;

    if (!label || lat == null || lng == null) {
      res.status(400).json({ error: 'label, lat, lng required' });
      return;
    }

    // Find the original segment (must belong to this user)
    const original = await Segment.findOne({ _id: req.params.id, userId: req.user!.userId });
    if (!original) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    const [fromJoint, toJoint] = await Promise.all([
      FiberJoint.findOne({ _id: original.fromJointId, userId: req.user!.userId }),
      FiberJoint.findOne({ _id: original.toJointId, userId: req.user!.userId }),
    ]);
    if (!fromJoint || !toJoint) {
      res.status(404).json({ error: 'Original joints not found' });
      return;
    }

    // Create the splice joint
    const spliceJoint = await FiberJoint.create({
      label,
      notes: notes || '',
      jointType: jointType || 'Splice',
      cableType: cableType || original.cableType,
      fiberCount: fiberCount ?? original.fiberCount,
      lat, lng,
      userId: req.user!.userId,
      createdBy: { userId: req.user!.userId, userName: req.user!.userName },
    });

    // Split waypoints: those before splice go to segment A, those after go to segment B
    const allWaypoints = original.waypoints || [];
    // Find split index — waypoints closest to splice point go to first half
    let splitIdx = 0;
    let minDist = Infinity;
    const spliceCoord = { lat, lng };
    for (let i = 0; i <= allWaypoints.length; i++) {
      const prev = i === 0 ? { lat: fromJoint.lat, lng: fromJoint.lng } : allWaypoints[i - 1];
      const d = haversineMeters(prev.lat, prev.lng, spliceCoord.lat, spliceCoord.lng);
      if (d < minDist) { minDist = d; splitIdx = i; }
    }

    const waypointsA = allWaypoints.slice(0, splitIdx);
    const waypointsB = allWaypoints.slice(splitIdx);

    // Calculate distances
    const pointsA = [{ lat: fromJoint.lat, lng: fromJoint.lng }, ...waypointsA, { lat, lng }];
    const pointsB = [{ lat, lng }, ...waypointsB, { lat: toJoint.lat, lng: toJoint.lng }];

    let distA = 0;
    for (let i = 0; i < pointsA.length - 1; i++) {
      distA += haversineMeters(pointsA[i].lat, pointsA[i].lng, pointsA[i + 1].lat, pointsA[i + 1].lng);
    }
    let distB = 0;
    for (let i = 0; i < pointsB.length - 1; i++) {
      distB += haversineMeters(pointsB[i].lat, pointsB[i].lng, pointsB[i + 1].lat, pointsB[i + 1].lng);
    }

    // Create two new segments
    const [segA, segB] = await Promise.all([
      Segment.create({
        fromJointId: original.fromJointId,
        toJointId: spliceJoint._id,
        waypoints: waypointsA,
        cableType: original.cableType,
        fiberCount: original.fiberCount,
        lengthMeters: Math.round(distA * 100) / 100,
        userId: req.user!.userId,
        createdBy: { userId: req.user!.userId, userName: req.user!.userName },
      }),
      Segment.create({
        fromJointId: spliceJoint._id,
        toJointId: original.toJointId,
        waypoints: waypointsB,
        cableType: original.cableType,
        fiberCount: original.fiberCount,
        lengthMeters: Math.round(distB * 100) / 100,
        userId: req.user!.userId,
        createdBy: { userId: req.user!.userId, userName: req.user!.userName },
      }),
    ]);

    // Delete the original segment
    await Segment.findByIdAndDelete(original._id);

    res.status(201).json({ spliceJoint, segmentA: segA, segmentB: segB, deletedSegmentId: original._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to splice joint' });
  }
});
export default router;
