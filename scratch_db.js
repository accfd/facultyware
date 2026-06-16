const db = require('./lib/db');

async function main() {
  try {
    console.log('--- VERIFICATION OF SEEDED TRANSACTION DATA ---');
    
    const [[{ count: totalRequests }]] = await db.query('SELECT COUNT(*) as count FROM room_maintenance_requests');
    console.log(`Total Maintenance Requests: ${totalRequests}`);

    const [[{ count: totalLogs }]] = await db.query('SELECT COUNT(*) as count FROM room_maintenance_request_log');
    console.log(`Total Request Logs: ${totalLogs}`);

    console.log('\nRequests grouped by Month & Status:');
    const [stats] = await db.query(`
      SELECT 
        DATE_FORMAT(reported_at, '%Y-%m') AS month,
        status, 
        COUNT(*) as count 
      FROM room_maintenance_requests 
      GROUP BY month, status
      ORDER BY month, status
    `);
    console.table(stats);

    console.log('\nRequests grouped by PJ / Department:');
    const [pjStats] = await db.query(`
      SELECT 
        e.name AS pj_name,
        r.code AS room_code,
        COUNT(rmr.id) as total_requests
      FROM rooms r
      JOIN employees e ON r.responsible_employee_id = e.id
      LEFT JOIN room_maintenance_requests rmr ON rmr.room_id = r.id
      GROUP BY pj_name, room_code
      ORDER BY pj_name, room_code
    `);
    console.table(pjStats);

  } catch (err) {
    console.error(err);
  } finally {
    await db.end();
  }
}

main();
