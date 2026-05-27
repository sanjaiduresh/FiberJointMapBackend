import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Organization from '../models/Organization';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth';

const router = Router();

// Apply auth middleware and require ADMIN role for all routes in this file
router.use(authMiddleware, requireRole('ADMIN'));

// ==========================================
// ORGANIZATIONS
// ==========================================

// GET /api/admin/organizations — List all organizations for this admin
router.get('/organizations', async (req: AuthRequest, res: Response) => {
  try {
    const orgs = await Organization.find({ adminId: req.user!.userId }).sort({ createdAt: -1 });
    res.json(orgs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// POST /api/admin/organizations — Create a new organization
router.post('/organizations', async (req: AuthRequest, res: Response) => {
  try {
    const { orgName } = req.body;

    if (!orgName) {
      res.status(400).json({ error: 'orgName is required' });
      return;
    }

    const org = await Organization.create({
      name: orgName,
      createdBy: req.user!.userId, // Admin is technically the creator here
      adminId: req.user!.userId,
    });

    res.status(201).json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create organization' });
  }
});

// PUT /api/admin/organizations/:id — Update organization name
router.put('/organizations/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { orgName } = req.body;
    if (!orgName) {
      res.status(400).json({ error: 'orgName is required' });
      return;
    }

    const org = await Organization.findOne({ _id: req.params.id, adminId: req.user!.userId });
    if (!org) {
      res.status(404).json({ error: 'Organization not found or you do not have permission' });
      return;
    }

    org.name = orgName;
    await org.save();

    res.json(org);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// ==========================================
// USERS
// ==========================================

// GET /api/admin/users — List all users belonging to organizations owned by this admin
router.get('/users', async (req: AuthRequest, res: Response) => {
  try {
    const orgs = await Organization.find({ adminId: req.user!.userId });
    const orgIds = orgs.map(org => org._id.toString());

    const users = await User.find({ 
      role: { $ne: 'ADMIN' },
      organizationId: { $in: orgIds }
    })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/admin/users — Create an employee or owner under an existing organization
router.post('/users', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, password, role, organizationId } = req.body;

    if (!name || !email || !password || !role || !organizationId) {
      res.status(400).json({ error: 'name, email, password, role, and organizationId are required' });
      return;
    }

    if (role === 'ADMIN') {
      res.status(400).json({ error: 'Cannot create ADMIN through this endpoint' });
      return;
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const org = await Organization.findOne({ _id: organizationId, adminId: req.user!.userId });
    if (!org) {
      res.status(404).json({ error: 'Organization not found or you do not have permission' });
      return;
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hashed,
      role,
      organizationId,
    });

    res.status(201).json({ id: user._id, name: user.name, email: user.email, role: user.role, organizationId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// PUT /api/admin/users/:id — Update user details (name, email, role, organizationId)
router.put('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { name, email, role, organizationId } = req.body;

    if (!name || !email || !role || !organizationId) {
      res.status(400).json({ error: 'name, email, role, and organizationId are required' });
      return;
    }

    if (role === 'ADMIN') {
      res.status(400).json({ error: 'Cannot set role to ADMIN' });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify admin owns the original user's org
    const originalOrg = await Organization.findOne({ _id: user.organizationId, adminId: req.user!.userId });
    if (!originalOrg) {
      res.status(403).json({ error: 'Permission denied to edit this user' });
      return;
    }

    // Verify admin owns the destination user's org (if changed)
    const destOrg = await Organization.findOne({ _id: organizationId, adminId: req.user!.userId });
    if (!destOrg) {
      res.status(403).json({ error: 'Destination organization not found or permission denied' });
      return;
    }

    // Check email uniqueness if email changed
    if (email.toLowerCase() !== user.email.toLowerCase()) {
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        res.status(409).json({ error: 'Email already registered' });
        return;
      }
    }

    user.name = name;
    user.email = email.toLowerCase();
    user.role = role;
    user.organizationId = organizationId;
    await user.save();

    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, organizationId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// PUT /api/admin/users/:id/password — Reset user password
router.put('/users/:id/password', async (req: AuthRequest, res: Response) => {
  try {
    const { password } = req.body;
    if (!password) {
      res.status(400).json({ error: 'New password is required' });
      return;
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify admin owns the user's org
    const org = await Organization.findOne({ _id: user.organizationId, adminId: req.user!.userId });
    if (!org) {
      res.status(403).json({ error: 'Permission denied to reset this user' });
      return;
    }

    user.password = await bcrypt.hash(password, 10);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// DELETE /api/admin/users/:id — Delete user
router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Verify admin owns the user's org
    const org = await Organization.findOne({ _id: user.organizationId, adminId: req.user!.userId });
    if (!org) {
      res.status(403).json({ error: 'Permission denied to delete this user' });
      return;
    }

    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
