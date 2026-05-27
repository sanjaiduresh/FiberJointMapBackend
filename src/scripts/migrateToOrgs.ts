/**
 * Migration script: Converts existing single-user data to Organization-based multi-tenant data.
 *
 * For each existing user:
 *  1. Creates an Organization
 *  2. Updates the user with organizationId and role=OWNER
 *  3. Updates all FiberJoints, Segments, and Cuts that had userId = user._id
 *     to use organizationId instead, and sets approvalStatus = APPROVED
 *
 * Usage: npx ts-node src/scripts/migrateToOrgs.ts
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from the backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set in .env');
  process.exit(1);
}

async function migrate() {
  await mongoose.connect(MONGODB_URI!);
  console.log('✅ Connected to MongoDB');

  const db = mongoose.connection.db!;

  const usersCol = db.collection('users');
  const orgsCol = db.collection('organizations');
  const jointsCol = db.collection('fiberjoints');
  const segmentsCol = db.collection('segments');
  const cutsCol = db.collection('cuts');

  const users = await usersCol.find({}).toArray();
  console.log(`Found ${users.length} users to migrate`);

  for (const user of users) {
    const userId = user._id.toString();

    // Skip if user already has an organizationId
    if (user.organizationId) {
      console.log(`  ⏭️  User "${user.name}" (${user.email}) already migrated, skipping`);
      continue;
    }

    // 1. Create an Organization for this user
    const orgResult = await orgsCol.insertOne({
      name: `${user.name}'s Organization`,
      createdBy: userId,
      createdAt: new Date(),
    });
    const orgId = orgResult.insertedId.toString();
    console.log(`  🏢 Created Organization "${user.name}'s Organization" (${orgId})`);

    // 2. Update the user
    await usersCol.updateOne(
      { _id: user._id },
      { $set: { organizationId: orgId, role: 'OWNER' } }
    );
    console.log(`  👤 Updated user "${user.name}" → OWNER of org ${orgId}`);

    // 3. Migrate FiberJoints
    const jointResult = await jointsCol.updateMany(
      { userId: userId },
      {
        $set: { organizationId: orgId, approvalStatus: 'APPROVED' },
        $unset: { userId: '' },
      }
    );
    console.log(`  📍 Migrated ${jointResult.modifiedCount} joints`);

    // 4. Migrate Segments
    const segResult = await segmentsCol.updateMany(
      { userId: userId },
      {
        $set: { organizationId: orgId, approvalStatus: 'APPROVED' },
        $unset: { userId: '' },
      }
    );
    console.log(`  🔗 Migrated ${segResult.modifiedCount} segments`);

    // 5. Migrate Cuts
    const cutResult = await cutsCol.updateMany(
      { userId: userId },
      {
        $set: { organizationId: orgId, approvalStatus: 'APPROVED' },
        $unset: { userId: '' },
      }
    );
    console.log(`  ✂️  Migrated ${cutResult.modifiedCount} cuts`);
  }

  console.log('\n✅ Migration complete!');
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
