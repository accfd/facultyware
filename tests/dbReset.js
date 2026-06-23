const { execSync } = require('child_process');
const db = require('../lib/db');

async function reset() {
  console.log('\n[TEST SETUP] Truncating transaction tables...');
  try {
    await db.query('SET FOREIGN_KEY_CHECKS = 0');
    await db.query('TRUNCATE TABLE room_maintenance_request_log');
    await db.query('TRUNCATE TABLE room_maintenance_requests');
    await db.query('TRUNCATE TABLE express_sessions');
    await db.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('[TEST SETUP] Transaction tables truncated successfully.');
  } catch (err) {
    console.error('[TEST SETUP] Failed to truncate tables:', err);
    throw err;
  } finally {
    await db.end();
  }

  console.log('[TEST SETUP] Running database seeder...');
  execSync('node scripts/seed.js', { stdio: 'inherit' });

  console.log('[TEST SETUP] Running transaction seeder...');
  execSync('node scripts/seed_transactions.js', { stdio: 'inherit' });

  console.log('[TEST SETUP] Database reset and seed completed successfully!\n');
}

module.exports = reset;
