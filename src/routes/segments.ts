import { Router, Response } from 'express';
import Segment from '../models/Segment';
import FiberJoint from '../models/FiberJoint';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';

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

// GET /api/segments — fetch segments for the organization
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = { organizationId: req.user!.organizationId };

    const { approvalStatus } = req.query;
    if (approvalStatus && typeof approvalStatus === 'string') {
      const statuses = approvalStatus.split(',');
      if (statuses.length > 1) {
        filter.approvalStatus = { $in: statuses };
      } else {
        filter.approvalStatus = approvalStatus;
      }
    }

    const segments = await Segment.find(filter).sort({ createdAt: -1 });
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

    // Look up joints (must belong to this organization)
    const [fromJoint, toJoint] = await Promise.all([
      FiberJoint.findOne({ _id: fromJointId, organizationId: req.user!.organizationId }),
      FiberJoint.findOne({ _id: toJointId, organizationId: req.user!.organizationId }),
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

    // EMPLOYEE creations are PENDING, OWNER creations are APPROVED
    const approvalStatus = req.user!.role === 'OWNER' ? 'APPROVED' : 'PENDING';

    const segment = await Segment.create({
      fromJointId,
      toJointId,
      waypoints: validWaypoints,
      cableType,
      fiberCount,
      lengthMeters: finalLength,
      organizationId: req.user!.organizationId,
      createdBy: {
        userId: req.user!.userId,
        userName: req.user!.userName,
      },
      approvalStatus,
    });

    res.status(201).json(segment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create segment' });
  }
});

// DELETE /api/segments/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const segment = await Segment.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    const isEmployee = req.user!.role !== 'ADMIN' && req.user!.role !== 'OWNER';
    if (isEmployee) {
      segment.approvalStatus = 'PENDING_DELETE';
      await segment.save();
      res.json({ message: 'Segment delete requested' });
      return;
    }

    await Segment.findByIdAndDelete(req.params.id);
    res.json({ message: 'Segment deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete segment' });
  }
});

// PUT /api/segments/:id/approve — OWNER only
router.put('/:id/approve', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const segment = await Segment.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user!.organizationId },
      { approvalStatus: 'APPROVED' },
      { new: true }
    );
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json(segment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve segment' });
  }
});

// PUT /api/segments/:id/reject — OWNER only
router.put('/:id/reject', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const segment = await Segment.findOneAndUpdate(
      { _id: req.params.id, organizationId: req.user!.organizationId },
      { approvalStatus: 'REJECTED' },
      { new: true }
    );
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json(segment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject segment' });
  }
});

// POST /api/segments/:id/splice
router.post('/:id/splice', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { label, notes, jointType, cableType, fiberCount, lat, lng } = req.body;

    if (!label || lat == null || lng == null) {
      res.status(400).json({ error: 'label, lat, lng required' });
      return;
    }

    // Find the original segment (must belong to this org)
    const original = await Segment.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!original) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }

    const [fromJoint, toJoint] = await Promise.all([
      FiberJoint.findOne({ _id: original.fromJointId, organizationId: req.user!.organizationId }),
      FiberJoint.findOne({ _id: original.toJointId, organizationId: req.user!.organizationId }),
    ]);
    if (!fromJoint || !toJoint) {
      res.status(404).json({ error: 'Original joints not found' });
      return;
    }

    // EMPLOYEE creations are PENDING, OWNER creations are APPROVED
    const approvalStatus = req.user!.role === 'OWNER' ? 'APPROVED' : 'PENDING';

    // Create the splice joint
    const spliceJoint = await FiberJoint.create({
      label,
      notes: notes || '',
      jointType: jointType || 'Splice',
      cableType: cableType || original.cableType,
      fiberCount: fiberCount ?? original.fiberCount,
      lat, lng,
      organizationId: req.user!.organizationId,
      createdBy: { userId: req.user!.userId, userName: req.user!.userName },
      approvalStatus,
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
        organizationId: req.user!.organizationId,
        createdBy: { userId: req.user!.userId, userName: req.user!.userName },
        approvalStatus,
      }),
      Segment.create({
        fromJointId: spliceJoint._id,
        toJointId: original.toJointId,
        waypoints: waypointsB,
        cableType: original.cableType,
        fiberCount: original.fiberCount,
        lengthMeters: Math.round(distB * 100) / 100,
        organizationId: req.user!.organizationId,
        createdBy: { userId: req.user!.userId, userName: req.user!.userName },
        approvalStatus,
      }),
    ]);

    // Delete the original segment
    const isEmployee = req.user!.role !== 'ADMIN' && req.user!.role !== 'OWNER';
    if (isEmployee) {
      original.approvalStatus = 'PENDING_DELETE';
      await original.save();
    } else {
      await Segment.findByIdAndDelete(original._id);
    }

    res.status(201).json({ spliceJoint, segmentA: segA, segmentB: segB, deletedSegmentId: original._id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to splice joint' });
  }
});
// PUT /api/segments/:id/approve — OWNER only
router.put('/:id/approve', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const segment = await Segment.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    
    if (segment.approvalStatus === 'PENDING_DELETE') {
      await Segment.findByIdAndDelete(segment._id);
      res.json({ message: 'Segment deleted' });
      return;
    }

    if (segment.approvalStatus === 'PENDING_EDIT' && segment.pendingEdits) {
      // (If segment editing is ever added)
      if (segment.pendingEdits.cableType !== undefined) segment.cableType = segment.pendingEdits.cableType;
      if (segment.pendingEdits.fiberCount !== undefined) segment.fiberCount = segment.pendingEdits.fiberCount;
    }

    segment.pendingEdits = undefined;
    segment.approvalStatus = 'APPROVED';
    await segment.save();
    
    res.json(segment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve segment' });
  }
});

// PUT /api/segments/:id/reject — OWNER only
router.put('/:id/reject', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const segment = await Segment.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    
    if (segment.approvalStatus === 'PENDING') {
      await Segment.findByIdAndDelete(segment._id);
      res.json({ message: 'Segment rejected and deleted' });
      return;
    }
    
    if (segment.approvalStatus === 'PENDING_DELETE') {
      segment.approvalStatus = 'APPROVED';
      await segment.save();
    } else if (segment.approvalStatus === 'PENDING_EDIT') {
      segment.pendingEdits = undefined;
      segment.approvalStatus = 'APPROVED';
      await segment.save();
    } else {
      segment.approvalStatus = 'REJECTED';
      await segment.save();
    }
    
    res.json(segment);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject segment' });
  }
});

export default router;
