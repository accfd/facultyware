/**
 * scripts/seed.js
 * Seed database dengan data awal untuk aplikasi Maintenance Ruangan FTI Unand
 * Idempotent: aman dijalankan berulang kali
 * Jalankan dengan: node scripts/seed.js
 */

require('dotenv').config();
const db = require('../lib/db');
const bcrypt = require('bcryptjs');

function log(msg)  { console.log(`\n[SEED] ${msg}`); }
function ok(msg)   { console.log(`  ✓  ${msg}`); }
function skip(msg) { console.log(`  –  ${msg} (sudah ada, dilewati)`); }
function warn(msg) { console.log(`  ⚠  ${msg}`); }

// ─── 1. ROLES ─────────────────────────────────────────────────────────────────

async function seedRoles() {
  log('Seeding roles...');
  const roles = [
    { name: 'pengguna',         guard_name: 'web' },
    { name: 'penanggung_jawab', guard_name: 'web' },
    { name: 'pengelola_aset',   guard_name: 'web' },
  ];
  for (const role of roles) {
    const [rows] = await db.query('SELECT id FROM roles WHERE name = ?', [role.name]);
    if (rows.length === 0) {
      await db.query(
        'INSERT INTO roles (name, guard_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [role.name, role.guard_name]
      );
      ok(`Role "${role.name}" dibuat`);
    } else {
      skip(`Role "${role.name}"`);
    }
  }
}

// ─── 2. PERMISSIONS ───────────────────────────────────────────────────────────

async function seedPermissions() {
  log('Seeding permissions...');
  const permissions = [
    'laporan.create', 'laporan.view_own', 'laporan.view_all',
    'laporan.update', 'laporan.delete',
    'maintenance.create', 'maintenance.view', 'maintenance.update',
    'maintenance.close', 'maintenance.revisi',
    'progres.create', 'progres.view', 'progres.update',
    'dashboard.view', 'pdf.download',
  ];
  for (const name of permissions) {
    const [rows] = await db.query('SELECT id FROM permissions WHERE name = ?', [name]);
    if (rows.length === 0) {
      await db.query(
        'INSERT INTO permissions (name, guard_name, created_at, updated_at) VALUES (?, ?, NOW(), NOW())',
        [name, 'web']
      );
      ok(`Permission "${name}" dibuat`);
    } else {
      skip(`Permission "${name}"`);
    }
  }
}

// ─── 3. ROLE_HAS_PERMISSIONS ──────────────────────────────────────────────────

async function seedRolePermissions() {
  log('Seeding role_has_permissions...');
  const map = {
    pengguna:         ['laporan.create', 'laporan.view_own', 'pdf.download'],
    penanggung_jawab: ['laporan.view_all', 'laporan.update', 'laporan.delete',
                       'maintenance.create', 'maintenance.view', 'maintenance.update',
                       'maintenance.close', 'maintenance.revisi', 'dashboard.view', 'pdf.download'],
    pengelola_aset:   ['maintenance.view', 'progres.create', 'progres.view',
                       'progres.update', 'pdf.download'],
  };
  for (const [roleName, permNames] of Object.entries(map)) {
    const [[role]] = await db.query('SELECT id FROM roles WHERE name = ?', [roleName]);
    if (!role) { warn(`Role "${roleName}" tidak ditemukan`); continue; }
    for (const permName of permNames) {
      const [[perm]] = await db.query('SELECT id FROM permissions WHERE name = ?', [permName]);
      if (!perm) { warn(`Permission "${permName}" tidak ditemukan`); continue; }
      const [ex] = await db.query(
        'SELECT 1 FROM role_has_permissions WHERE role_id = ? AND permission_id = ?',
        [role.id, perm.id]
      );
      if (ex.length === 0) {
        await db.query('INSERT INTO role_has_permissions (role_id, permission_id) VALUES (?, ?)', [role.id, perm.id]);
        ok(`${roleName} → ${permName}`);
      } else {
        skip(`${roleName} → ${permName}`);
      }
    }
  }
}

// ─── 4. BUILDINGS ─────────────────────────────────────────────────────────────

async function seedBuildings() {
  log('Seeding buildings...');
  const buildings = [
    { name: 'Gedung A FTI', code: 'GDA', description: 'Gedung utama FTI Unand' },
    { name: 'Gedung B FTI', code: 'GDB', description: 'Gedung laboratorium FTI Unand' },
  ];
  for (const b of buildings) {
    const [rows] = await db.query('SELECT id FROM buildings WHERE code = ?', [b.code]);
    if (rows.length === 0) {
      await db.query(
        'INSERT INTO buildings (name, code, description, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [b.name, b.code, b.description]
      );
      ok(`Building "${b.name}" (${b.code}) dibuat`);
    } else {
      skip(`Building "${b.name}" (${b.code})`);
    }
  }
}

// ─── 5. EMPLOYMENT STATUSES ───────────────────────────────────────────────────

async function seedEmploymentStatuses() {
  log('Seeding employment_statuses...');
  for (const name of ['Dosen Tetap', 'Tenaga Kependidikan', 'Honorer']) {
    const [rows] = await db.query('SELECT id FROM employment_statuses WHERE name = ?', [name]);
    if (rows.length === 0) {
      await db.query('INSERT INTO employment_statuses (name, created_at, updated_at) VALUES (?, NOW(), NOW())', [name]);
      ok(`Employment status "${name}" dibuat`);
    } else {
      skip(`Employment status "${name}"`);
    }
  }
}

// ─── 6. ORGANIZATION UNITS ────────────────────────────────────────────────────
// Struktur tabel:
//   id, name, code, parent_id (nullable), type (ENUM NOT NULL),
//   description, organization_unit_id (NOT NULL — FK ke dirinya sendiri, diisi id sendiri)
//   Catatan: organization_unit_id kemungkinan self-reference (parent), kita isi = id sendiri

async function seedOrganizationUnits() {
  log('Seeding organization_units...');

  // Nonaktifkan FK sementara agar bisa insert self-reference
  await db.query('SET FOREIGN_KEY_CHECKS = 0');

  const units = [
    { name: 'Sistem Informasi',    code: 'SI',   type: 'department' },
    { name: 'Teknik Komputer',     code: 'TK',   type: 'department' },
    { name: 'Sarana dan Prasarana',code: 'SDP',  type: 'unit'       },
  ];

  for (const u of units) {
    const [rows] = await db.query('SELECT id FROM organization_units WHERE code = ?', [u.code]);
    if (rows.length === 0) {
      // Insert tanpa organization_unit_id dulu (FK off)
      const [result] = await db.query(
        `INSERT INTO organization_units
           (name, code, type, description, organization_unit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, NOW(), NOW())`,
        [u.name, u.code, u.type, u.name]
      );
      const newId = result.insertId;
      // Update organization_unit_id = id sendiri (self-reference)
      await db.query('UPDATE organization_units SET organization_unit_id = ? WHERE id = ?', [newId, newId]);
      ok(`Organization unit "${u.name}" dibuat (id=${newId})`);
    } else {
      skip(`Organization unit "${u.name}"`);
    }
  }

  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

// ─── 7. USERS (dibuat DULU sebelum employees karena employees.id FK ke users.id) ──

async function seedUsers() {
  log('Seeding users...');
  const hashedPassword = await bcrypt.hash('password123', 12);
  const users = [
    { name: 'Admin Pengguna', email: 'pengguna@fti.ac.id' },
    { name: 'Dewi Rahayu',    email: 'penanggung@fti.ac.id' },
    { name: 'Budi Santoso',   email: 'pengelola@fti.ac.id' },
  ];
  for (const user of users) {
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [user.email]);
    if (rows.length === 0) {
      await db.query(
        'INSERT INTO users (name, email, password, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())',
        [user.name, user.email, hashedPassword]
      );
      ok(`User "${user.name}" (${user.email}) dibuat`);
    } else {
      skip(`User "${user.name}" (${user.email})`);
    }
  }
}

// ─── 8. EMPLOYEES ─────────────────────────────────────────────────────────────
// PENTING: employees.id harus = users.id (ada FK constraint employees_user_id_foreign)
// Jadi: INSERT dengan SET id = users.id secara manual

async function seedEmployees() {
  log('Seeding employees...');

  const [[unitSarana]] = await db.query("SELECT id FROM organization_units WHERE code = 'SDP'");
  const [[unitSI]]     = await db.query("SELECT id FROM organization_units WHERE code = 'SI'");
  const [[statTK]]     = await db.query("SELECT id FROM employment_statuses WHERE name = 'Tenaga Kependidikan'");
  const [[statDosen]]  = await db.query("SELECT id FROM employment_statuses WHERE name = 'Dosen Tetap'");

  if (!unitSarana || !unitSI || !statTK || !statDosen) {
    console.error('  ✗  Prerequisite (organization_units/employment_statuses) tidak lengkap');
    return;
  }

  // Ambil user id berdasarkan email
  const [[userBudi]]  = await db.query("SELECT id FROM users WHERE email = 'pengelola@fti.ac.id'");
  const [[userDewi]]  = await db.query("SELECT id FROM users WHERE email = 'penanggung@fti.ac.id'");
  const [[userReza]]  = await db.query("SELECT id FROM users WHERE email = 'pengguna@fti.ac.id'");
  // Catatan mapping:
  //   pengelola@fti.ac.id → Budi Santoso (EMP001) → pengelola_aset
  //   penanggung@fti.ac.id → Dewi Rahayu (EMP002) → penanggung_jawab
  //   pengguna@fti.ac.id  → Reza/mahasiswa, tapi employees harus ada jika jadi reported_by
  // Namun karena pengguna adalah mahasiswa, reported_by pakai employee yang bisa juga mahasiswa
  // Kita buat 3 employee dari 3 user yang ada (id harus sama)

  const employees = [
    {
      userId: userBudi?.id,
      employee_number: 'EMP001',
      name: 'Budi Santoso',
      birth_place: 'Padang',
      birth_date: '1985-05-10',
      gender: 'male',
      marital_status: 'married',
      address: 'Jl. Kampus No. 1',
      organization_unit_id: unitSarana.id,
      hire_date: '2010-01-01',
      employment_status_id: statTK.id,
    },
    {
      userId: userDewi?.id,
      employee_number: 'EMP002',
      name: 'Dewi Rahayu',
      birth_place: 'Bukittinggi',
      birth_date: '1980-03-15',
      gender: 'female',
      marital_status: 'married',
      address: 'Jl. Universitas No. 5',
      organization_unit_id: unitSI.id,
      hire_date: '2008-06-01',
      employment_status_id: statDosen.id,
    },
    {
      userId: userReza?.id,
      employee_number: 'EMP003',
      name: 'Reza Firmansyah',
      birth_place: 'Pariaman',
      birth_date: '1990-07-20',
      gender: 'male',
      marital_status: 'single',
      address: 'Jl. Limau Manis No. 3',
      organization_unit_id: unitSarana.id,
      hire_date: '2015-03-01',
      employment_status_id: statTK.id,
    },
  ];

  // Nonaktifkan FK untuk insert id manual
  await db.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const emp of employees) {
    if (!emp.userId) { warn(`User untuk ${emp.employee_number} tidak ditemukan, lewati`); continue; }

    const [rows] = await db.query('SELECT id FROM employees WHERE employee_number = ?', [emp.employee_number]);
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO employees
           (id, employee_number, name, birth_place, birth_date, gender, marital_status,
            address, organization_unit_id, hire_date, employment_status_id, status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(), NOW())`,
        [
          emp.userId, emp.employee_number, emp.name, emp.birth_place, emp.birth_date,
          emp.gender, emp.marital_status, emp.address, emp.organization_unit_id,
          emp.hire_date, emp.employment_status_id,
        ]
      );
      ok(`Employee "${emp.name}" (${emp.employee_number}) dibuat dengan id=${emp.userId}`);
    } else {
      skip(`Employee "${emp.name}" (${emp.employee_number})`);
    }
  }

  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

// ─── 9. ASSETS ────────────────────────────────────────────────────────────────
// Kolom NOT NULL: name, code, type (ENUM: equipment|room), acquisition_type,
//                acquisition_date, condition, status

async function seedAssets() {
  log('Seeding assets...');
  const assets = [
    { name: 'Aset Ruang Sidang 1',      code: 'AST-RS1',   type: 'room', acquisition_type: 'procurement', acquisition_date: '2020-01-01', condition: 'good', status: 'in_use' },
    { name: 'Aset Laboratorium Komputer',code: 'AST-LAB01', type: 'room', acquisition_type: 'procurement', acquisition_date: '2019-06-01', condition: 'good', status: 'in_use' },
    { name: 'Aset Ruang Dosen',          code: 'AST-RD01',  type: 'room', acquisition_type: 'procurement', acquisition_date: '2018-03-01', condition: 'good', status: 'in_use' },
  ];
  for (const a of assets) {
    const [rows] = await db.query('SELECT id FROM assets WHERE code = ?', [a.code]);
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO assets
           (name, code, type, acquisition_type, acquisition_date, \`condition\`, \`status\`, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [a.name, a.code, a.type, a.acquisition_type, a.acquisition_date, a.condition, a.status]
      );
      ok(`Asset "${a.name}" (${a.code}) dibuat`);
    } else {
      skip(`Asset "${a.name}" (${a.code})`);
    }
  }
}

// ─── 10. ROOMS ────────────────────────────────────────────────────────────────

async function seedRooms() {
  log('Seeding rooms...');

  const [[emp001]] = await db.query("SELECT id FROM employees WHERE employee_number = 'EMP001'");
  const [[emp002]] = await db.query("SELECT id FROM employees WHERE employee_number = 'EMP002'");
  const [[gdA]]    = await db.query("SELECT id FROM buildings WHERE code = 'GDA'");
  const [[gdB]]    = await db.query("SELECT id FROM buildings WHERE code = 'GDB'");
  const [[astRS1]] = await db.query("SELECT id FROM assets WHERE code = 'AST-RS1'");
  const [[astLAB]] = await db.query("SELECT id FROM assets WHERE code = 'AST-LAB01'");
  const [[astRD]]  = await db.query("SELECT id FROM assets WHERE code = 'AST-RD01'");

  if (!emp001 || !emp002 || !gdA || !gdB) {
    console.error('  ✗  Prerequisite (employees/buildings) tidak lengkap untuk rooms');
    return;
  }

  const rooms = [
    { asset_id: astRS1?.id, building_id: gdA.id, name: 'Ruang Sidang 1',       code: 'RS1',   floor: '2', capacity: 30, is_public: 1, responsible_employee_id: emp002.id, employee_id: emp001.id },
    { asset_id: astLAB?.id, building_id: gdA.id, name: 'Laboratorium Komputer', code: 'LAB01', floor: '1', capacity: 40, is_public: 1, responsible_employee_id: emp002.id, employee_id: emp001.id },
    { asset_id: astRD?.id,  building_id: gdB.id, name: 'Ruang Dosen',           code: 'RD01',  floor: '3', capacity: 20, is_public: 0, responsible_employee_id: emp002.id, employee_id: emp001.id },
  ];

  for (const room of rooms) {
    const [rows] = await db.query('SELECT id FROM rooms WHERE code = ?', [room.code]);
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO rooms
           (asset_id, building_id, name, code, floor, capacity, is_public,
            responsible_employee_id, employee_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [room.asset_id, room.building_id, room.name, room.code, room.floor,
         room.capacity, room.is_public, room.responsible_employee_id, room.employee_id]
      );
      ok(`Room "${room.name}" (${room.code}) dibuat`);
    } else {
      skip(`Room "${room.name}" (${room.code})`);
    }
  }
}

// ─── 11. STUDENTS ─────────────────────────────────────────────────────────────
// students.id = users.id (FK ke users), tidak auto_increment

async function seedStudents() {
  log('Seeding students...');
  const [[user]] = await db.query("SELECT id FROM users WHERE email = 'pengguna@fti.ac.id'");
  if (!user) { warn('User pengguna@fti.ac.id tidak ditemukan'); return; }

  const [rows] = await db.query('SELECT id FROM students WHERE regno = ?', ['2110000001']);
  if (rows.length === 0) {
    await db.query(
      `INSERT INTO students (id, name, regno, email, campus_email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [user.id, 'Mahasiswa Demo', '2110000001', 'pengguna@fti.ac.id', '2110000001@student.fti.ac.id']
    );
    ok(`Student "Mahasiswa Demo" dibuat (id=${user.id})`);
  } else {
    skip('Student "Mahasiswa Demo" (2110000001)');
  }
}

// ─── 12. MODEL_HAS_ROLES ──────────────────────────────────────────────────────

async function seedModelHasRoles() {
  log('Seeding model_has_roles...');
  const assignments = [
    { email: 'pengguna@fti.ac.id',   roleName: 'pengguna' },
    { email: 'penanggung@fti.ac.id', roleName: 'penanggung_jawab' },
    { email: 'pengelola@fti.ac.id',  roleName: 'pengelola_aset' },
  ];
  for (const a of assignments) {
    const [[user]] = await db.query('SELECT id FROM users WHERE email = ?', [a.email]);
    const [[role]] = await db.query('SELECT id FROM roles WHERE name = ?', [a.roleName]);
    if (!user || !role) { warn(`User/role tidak ditemukan untuk ${a.email}`); continue; }

    const [ex] = await db.query(
      "SELECT 1 FROM model_has_roles WHERE model_id = ? AND model_type = 'App\\\\Models\\\\User' AND role_id = ?",
      [user.id, role.id]
    );
    if (ex.length === 0) {
      await db.query(
        "INSERT INTO model_has_roles (role_id, model_type, model_id) VALUES (?, 'App\\\\Models\\\\User', ?)",
        [role.id, user.id]
      );
      ok(`${a.email} → "${a.roleName}"`);
    } else {
      skip(`${a.email} → "${a.roleName}"`);
    }
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════');
  console.log('  SEED DATABASE — Maintenance Ruangan FTI Unand        ');
  console.log('═══════════════════════════════════════════════════════');

  try {
    await seedRoles();
    await seedPermissions();
    await seedRolePermissions();
    await seedBuildings();
    await seedEmploymentStatuses();
    await seedOrganizationUnits();
    // PENTING: users dulu sebelum employees (FK employees.id → users.id)
    await seedUsers();
    await seedEmployees();
    await seedAssets();
    await seedRooms();
    await seedStudents();
    await seedModelHasRoles();

    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  ✓  Seed selesai!                                     ');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
    console.log('  Akun testing:');
    console.log('  ┌──────────────────────────┬─────────────┬───────────────────┐');
    console.log('  │ Email                     │ Password    │ Role              │');
    console.log('  ├──────────────────────────┼─────────────┼───────────────────┤');
    console.log('  │ pengguna@fti.ac.id        │ password123 │ pengguna          │');
    console.log('  │ penanggung@fti.ac.id      │ password123 │ penanggung_jawab  │');
    console.log('  │ pengelola@fti.ac.id       │ password123 │ pengelola_aset    │');
    console.log('  └──────────────────────────┴─────────────┴───────────────────┘');
    console.log('');

  } catch (err) {
    console.error('\n  ✗  Error saat seeding:', err.message);
    console.error(err);
    // Pastikan FK check dikembalikan walau error
    await db.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    process.exit(1);
  } finally {
    await db.end();
    process.exit(0);
  }
}

main();
