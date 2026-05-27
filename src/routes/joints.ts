import { Router, Response } from 'express';
import FiberJoint from '../models/FiberJoint';
import Segment from '../models/Segment';
import Cut from '../models/Cut';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';
import { v2 as cloudinary } from 'cloudinary';
import multer from 'multer';

// Configure Cloudinary from CLOUDINARY_URL env
cloudinary.config();

// Multer: store file in memory buffer (we stream it to Cloudinary)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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

// GET /api/joints
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const filter: any = { organizationId: req.user!.organizationId };

    // Allow filtering by approvalStatus query param
    const { approvalStatus } = req.query;
    if (approvalStatus && typeof approvalStatus === 'string') {
      const statuses = approvalStatus.split(',');
      if (statuses.length > 1) {
        filter.approvalStatus = { $in: statuses };
      } else {
        filter.approvalStatus = approvalStatus;
      }
    }

    const joints = await FiberJoint.find(filter).sort({ createdAt: -1 });
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

    // EMPLOYEE creations are PENDING, OWNER creations are APPROVED
    const approvalStatus = req.user!.role === 'OWNER' ? 'APPROVED' : 'PENDING';

    const joint = await FiberJoint.create({
      label,
      notes: notes || '',
      jointType: jointType || 'Main',
      cableType: cableType || 'Single Mode',
      fiberCount: fiberCount ?? 12,
      lat, lng,
      organizationId: req.user!.organizationId,
      createdBy: { userId: req.user!.userId, userName: req.user!.userName },
      approvalStatus,
    });
    res.status(201).json(joint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create joint' });
  }
});

// PUT /api/joints/:id
router.put('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { label, notes, jointType, cableType, fiberCount, lat, lng } = req.body;

    const joint = await FiberJoint.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    const isEmployee = req.user!.role !== 'ADMIN' && req.user!.role !== 'OWNER';
    const isApproved = joint.approvalStatus === 'APPROVED' || joint.approvalStatus === 'PENDING_EDIT';
    const useDraftEdits = isEmployee && isApproved;

    let hasChanges = false;
    const updates: Partial<typeof joint> = {};

    if (label !== undefined && label !== joint.label) { updates.label = label; hasChanges = true; }
    if (notes !== undefined && notes !== joint.notes) { updates.notes = notes; hasChanges = true; }
    if (jointType !== undefined && jointType !== joint.jointType) { updates.jointType = jointType; hasChanges = true; }
    if (cableType !== undefined && cableType !== joint.cableType) { updates.cableType = cableType; hasChanges = true; }
    if (fiberCount !== undefined && fiberCount !== joint.fiberCount) { updates.fiberCount = fiberCount; hasChanges = true; }
    if (lat !== undefined && lat !== joint.lat) { updates.lat = lat; hasChanges = true; }
    if (lng !== undefined && lng !== joint.lng) { updates.lng = lng; hasChanges = true; }

    const latChanged = useDraftEdits ? (updates.lat !== undefined) : (updates.lat !== undefined);

    if (useDraftEdits) {
      if (hasChanges) {
        joint.pendingEdits = {
          ...(joint.pendingEdits || {}),
          ...updates,
        };
        joint.approvalStatus = 'PENDING_EDIT';
        joint.markModified('pendingEdits');
      }
    } else {
      if (updates.label !== undefined) joint.label = updates.label;
      if (updates.notes !== undefined) joint.notes = updates.notes;
      if (updates.jointType !== undefined) joint.jointType = updates.jointType;
      if (updates.cableType !== undefined) joint.cableType = updates.cableType;
      if (updates.fiberCount !== undefined) joint.fiberCount = updates.fiberCount;
      if (updates.lat !== undefined) joint.lat = updates.lat;
      if (updates.lng !== undefined) joint.lng = updates.lng;
    }

    await joint.save();

    // Only recalculate segments immediately if the direct lat/lng changed.
    // If it's a draft edit, we do NOT recalculate segments until it's approved!
    if (!useDraftEdits && (updates.lat !== undefined || updates.lng !== undefined)) {
      // Recalculate connected segment lengths
      const connectedSegments = await Segment.find({
        organizationId: req.user!.organizationId,
        $or: [{ fromJointId: joint._id }, { toJointId: joint._id }],
      });

      for (const seg of connectedSegments) {
        const fromJoint = await FiberJoint.findById(seg.fromJointId);
        const toJoint = await FiberJoint.findById(seg.toJointId);
        if (!fromJoint || !toJoint) continue;

        const routePoints = [
          { lat: fromJoint.lat, lng: fromJoint.lng },
          ...(seg.waypoints || []),
          { lat: toJoint.lat, lng: toJoint.lng },
        ];
        let autoDistance = 0;
        for (let i = 0; i < routePoints.length - 1; i++) {
          autoDistance += haversineMeters(
            routePoints[i].lat, routePoints[i].lng,
            routePoints[i + 1].lat, routePoints[i + 1].lng,
          );
        }
        seg.lengthMeters = Math.round(autoDistance * 100) / 100;
        await seg.save();
      }
    }

    res.json(joint);
  } catch (err) {
    console.error('Update joint error:', err);
    res.status(500).json({ error: 'Failed to update joint' });
  }
});

// DELETE /api/joints/:id
router.delete('/:id', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const joint = await FiberJoint.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    // Find all segments connected to this joint
    const connectedSegments = await Segment.find({
      organizationId: req.user!.organizationId,
      $or: [{ fromJointId: req.params.id }, { toJointId: req.params.id }],
    });

    const isEmployee = req.user!.role !== 'ADMIN' && req.user!.role !== 'OWNER';
    if (isEmployee) {
      joint.approvalStatus = 'PENDING_DELETE';
      await joint.save();

      for (const seg of connectedSegments) {
        seg.approvalStatus = 'PENDING_DELETE';
        await seg.save();
      }
      res.json({ message: 'Delete requested', merged: false });
      return;
    }

    // ── Admin logic below ──

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
      const waypointsA: Array<{ lat: number; lng: number }> =
        segA.fromJointId.toString() === outerA.toString()
          ? segA.waypoints ?? []
          : [...(segA.waypoints ?? [])].reverse();

      // Orient segB waypoints so they run splice → outerB
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
        organizationId: req.user!.organizationId,
        createdBy: { userId: req.user!.userId, userName: req.user!.userName },
        approvalStatus: 'APPROVED',
      });

      // Delete cuts on both old segments
      await Cut.deleteMany({
        segmentId: { $in: [segA._id, segB._id] },
        organizationId: req.user!.organizationId,
      });

      // Delete the two original segments
      await Segment.deleteMany({ _id: { $in: [segA._id, segB._id] } });

    } else {
      // ── Normal delete: cascade segments + cuts ──────────────────────────
      const segmentIds = connectedSegments.map((s) => s._id);

      if (segmentIds.length > 0) {
        await Cut.deleteMany({ segmentId: { $in: segmentIds }, organizationId: req.user!.organizationId });
        await Segment.deleteMany({ _id: { $in: segmentIds }, organizationId: req.user!.organizationId });
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

// PUT /api/joints/:id/approve — OWNER only
router.put('/:id/approve', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const joint = await FiberJoint.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    if (joint.approvalStatus === 'PENDING_DELETE') {
      // Find all segments connected to this joint and delete them if they are also PENDING_DELETE
      const connectedSegments = await Segment.find({
        organizationId: req.user!.organizationId,
        $or: [{ fromJointId: req.params.id }, { toJointId: req.params.id }],
      });
      
      const segmentIds = connectedSegments.map(s => s._id);
      if (segmentIds.length > 0) {
        await Cut.deleteMany({ segmentId: { $in: segmentIds }, organizationId: req.user!.organizationId });
        await Segment.deleteMany({ _id: { $in: segmentIds }, organizationId: req.user!.organizationId });
      }

      await FiberJoint.findByIdAndDelete(req.params.id);
      res.json({ message: 'Joint deleted' });
      return;
    }

    if (joint.approvalStatus === 'PENDING_EDIT' && joint.pendingEdits) {
      if (joint.pendingEdits.label !== undefined) joint.label = joint.pendingEdits.label;
      if (joint.pendingEdits.notes !== undefined) joint.notes = joint.pendingEdits.notes;
      if (joint.pendingEdits.jointType !== undefined) joint.jointType = joint.pendingEdits.jointType;
      if (joint.pendingEdits.cableType !== undefined) joint.cableType = joint.pendingEdits.cableType;
      if (joint.pendingEdits.fiberCount !== undefined) joint.fiberCount = joint.pendingEdits.fiberCount;
      if (joint.pendingEdits.lat !== undefined) joint.lat = joint.pendingEdits.lat;
      if (joint.pendingEdits.lng !== undefined) joint.lng = joint.pendingEdits.lng;
    }

    joint.pendingEdits = undefined;
    joint.approvalStatus = 'APPROVED';
    await joint.save();

    res.json(joint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to approve joint' });
  }
});

// PUT /api/joints/:id/reject — OWNER only
router.put('/:id/reject', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const joint = await FiberJoint.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    if (joint.approvalStatus === 'PENDING') {
      await FiberJoint.findByIdAndDelete(req.params.id);
      res.json({ message: 'Joint rejected and deleted' });
      return;
    }

    if (joint.approvalStatus === 'PENDING_DELETE') {
      joint.approvalStatus = 'APPROVED';
      await joint.save();
      // Also restore segments that were pending delete along with this joint
      await Segment.updateMany(
        { 
          organizationId: req.user!.organizationId,
          $or: [{ fromJointId: req.params.id }, { toJointId: req.params.id }],
          approvalStatus: 'PENDING_DELETE'
        },
        { approvalStatus: 'APPROVED' }
      );
    } else if (joint.approvalStatus === 'PENDING_EDIT') {
      joint.pendingEdits = undefined;
      joint.approvalStatus = 'APPROVED';
      await joint.save();
    } else {
      joint.approvalStatus = 'REJECTED';
      await joint.save();
    }

    res.json(joint);
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject joint' });
  }
});

// GET /api/joints/base
router.get('/base', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const base = await FiberJoint.findOne({ organizationId: req.user!.organizationId, jointType: 'Base' });
    res.json(base || null);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch base joint' });
  }
});

// POST /api/joints/:id/photos — Upload a photo to a joint
router.post('/:id/photos', authMiddleware, upload.single('photo'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No photo file provided' });
      return;
    }

    const joint = await FiberJoint.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    // Upload to Cloudinary from memory buffer
    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `fibertrack/${req.user!.organizationId}`,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) reject(error || new Error('Upload failed'));
          else resolve({ secure_url: result.secure_url, public_id: result.public_id });
        },
      );
      stream.end(req.file!.buffer);
    });

    joint.photos.push({
      url: result.secure_url,
      publicId: result.public_id,
      uploadedAt: new Date(),
    });

    // If an employee uploads a photo, force status to PENDING_EDIT if currently APPROVED
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'OWNER') {
      if (joint.approvalStatus === 'APPROVED' || joint.approvalStatus === 'PENDING_EDIT') {
        joint.approvalStatus = 'PENDING_EDIT';
      }
    }

    await joint.save();

    res.status(201).json(joint);
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// DELETE /api/joints/:id/photos/:publicId — Remove a photo from a joint
router.delete('/:id/photos/:publicId', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const joint = await FiberJoint.findOne({ _id: req.params.id, organizationId: req.user!.organizationId });
    if (!joint) {
      res.status(404).json({ error: 'Joint not found' });
      return;
    }

    // The publicId comes URL-encoded because it has slashes (e.g. fibertrack/orgId/filename)
    const publicId = decodeURIComponent(req.params.publicId as string);
    const photoIdx = joint.photos.findIndex(p => p.publicId === publicId);
    if (photoIdx === -1) {
      res.status(404).json({ error: 'Photo not found on this joint' });
      return;
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Remove from DB
    joint.photos.splice(photoIdx, 1);

    // If an employee deletes a photo, force status to PENDING_EDIT if currently APPROVED
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'OWNER') {
      if (joint.approvalStatus === 'APPROVED' || joint.approvalStatus === 'PENDING_EDIT') {
        joint.approvalStatus = 'PENDING_EDIT';
      }
    }

    await joint.save();

    res.json(joint);
  } catch (err) {
    console.error('Photo delete error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

export default router;