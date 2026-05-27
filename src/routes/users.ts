import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Organization from '../models/Organization';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/users — list team members in the organization (OWNER only)
router.get('/', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const users = await User.find({ organizationId: req.user!.organizationId })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users.map((u) => ({
      id: u._id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// POST /api/users — create an employee account (OWNER only)
router.post('/', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: 'email, password, and name are required' });
      return;
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      email: email.toLowerCase(),
      password: hashed,
      name,
      organizationId: req.user!.organizationId,
      role: role === 'OWNER' ? 'OWNER' : 'EMPLOYEE',
    });

    res.status(201).json({
      id: newUser._id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      createdAt: newUser.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create team member' });
  }
});

// DELETE /api/users/:id — remove a team member (OWNER only, cannot remove self)
router.delete('/:id', authMiddleware, requireRole('OWNER'), async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id === req.user!.userId) {
      res.status(400).json({ error: 'You cannot remove yourself' });
      return;
    }

    const deleted = await User.findOneAndDelete({
      _id: req.params.id,
      organizationId: req.user!.organizationId,
    });

    if (!deleted) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ message: 'Team member removed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// GET /api/users/org — get organization info
router.get('/org', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const org = await Organization.findById(req.user!.organizationId);
    if (!org) {
      res.status(404).json({ error: 'Organization not found' });
      return;
    }
    res.json({ id: org._id, name: org.name, createdAt: org.createdAt });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

export default router;
