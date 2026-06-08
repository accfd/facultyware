const db = require('./lib/db');

async function main() {
  try {
    console.log('Tables in database:');
    const [tables] = await db.query('SHOW TABLES');
    console.log(tables);

    console.log('\nColumns in room_maintenance_requests:');
    const [cols] = await db.query('DESCRIBE room_maintenance_requests');
    console.table(cols);

    console.log('\nColumns in rooms:');
    const [roomCols] = await db.query('DESCRIBE rooms');
    console.table(roomCols);

    console.log('\nAll users:');
    const [users] = await db.query('SELECT id, name, email FROM users');
    console.table(users);

    console.log('\nAll roles:');
    const [roles] = await db.query('SELECT id, name FROM roles');
    console.table(roles);

    console.log('\nAll employees:');
    const [employees] = await db.query('SELECT id, name, employee_number FROM employees');
    console.table(employees);
  } catch (err) {
    console.error(err);
  } finally {
    await db.end();
  }
}

main();
