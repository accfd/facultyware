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
// 3 gedung sesuai departemen: Sistem Informasi, Teknik Komputer, Informatika

async function seedBuildings() {
  log('Seeding buildings...');
  const buildings = [
    { name: 'Gedung Departemen Sistem Informasi', code: 'GDSI',  description: 'Gedung Departemen Sistem Informasi FTI Unand' },
    { name: 'Gedung Departemen Teknik Komputer',  code: 'GDTK',  description: 'Gedung Departemen Teknik Komputer FTI Unand'  },
    { name: 'Gedung Departemen Informatika',      code: 'GDINF', description: 'Gedung Departemen Informatika FTI Unand'      },
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
// Hanya 3 departemen: Sistem Informasi, Teknik Komputer, Informatika
// (tidak ada unit Sarana dan Prasarana)

async function seedOrganizationUnits() {
  log('Seeding organization_units...');

  // Nonaktifkan FK sementara agar bisa insert self-reference
  await db.query('SET FOREIGN_KEY_CHECKS = 0');

  const units = [
    { name: 'Sistem Informasi', code: 'SI',  type: 'department' },
    { name: 'Teknik Komputer',  code: 'TK',  type: 'department' },
    { name: 'Informatika',      code: 'INF', type: 'department' },
  ];

  for (const u of units) {
    const [rows] = await db.query('SELECT id FROM organization_units WHERE code = ?', [u.code]);
    if (rows.length === 0) {
      const [result] = await db.query(
        `INSERT INTO organization_units
           (name, code, type, description, organization_unit_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, NOW(), NOW())`,
        [u.name, u.code, u.type, u.name]
      );
      const newId = result.insertId;
      await db.query('UPDATE organization_units SET organization_unit_id = ? WHERE id = ?', [newId, newId]);
      ok(`Organization unit "${u.name}" dibuat (id=${newId})`);
    } else {
      skip(`Organization unit "${u.name}"`);
    }
  }

  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

// ─── 7. USERS ─────────────────────────────────────────────────────────────────
// Akun:
//   - pengguna1@unand.ac.id  → pengguna (mahasiswa Rafa)
//   - pengguna2@unand.ac.id  → pengguna (mahasiswa Fuad)
//   - pengguna3@unand.ac.id  → pengguna (dosen bukan penanggung jawab)
//   - pj1@unand.ac.id        → penanggung_jawab (Dept. Sistem Informasi)
//   - pj2@unand.ac.id        → penanggung_jawab (Dept. Teknik Komputer)
//   - pj3@unand.ac.id        → penanggung_jawab (Dept. Informatika)
//   - pengelola@unand.ac.id  → pengelola_aset

async function seedUsers() {
  log('Seeding users...');
  const hashedPassword = await bcrypt.hash('password123', 12);
  const users = [
    // Pengguna (mahasiswa & dosen biasa)
    { name: 'Rafa Ardian',       email: 'pengguna1@unand.ac.id' },
    { name: 'Fuad Maulana',      email: 'pengguna2@unand.ac.id' },
    { name: 'Dian Pratiwi',      email: 'pengguna3@unand.ac.id' },
    // Penanggung Jawab per departemen
    { name: 'Andi Kurniawan',    email: 'pj1@unand.ac.id' },
    { name: 'Sari Wulandari',    email: 'pj2@unand.ac.id' },
    { name: 'Hendra Wijaya',     email: 'pj3@unand.ac.id' },
    // Pengelola Aset
    { name: 'Budi Santoso',      email: 'pengelola@unand.ac.id' },
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
// employees.id = users.id (FK constraint employees_user_id_foreign)
// Karyawan: pj1, pj2, pj3 (dosen penanggung jawab), pengguna3 (dosen biasa), pengelola (tenaga kependidikan)

async function seedEmployees() {
  log('Seeding employees...');

  const [[unitSI]]    = await db.query("SELECT id FROM organization_units WHERE code = 'SI'");
  const [[unitTK]]    = await db.query("SELECT id FROM organization_units WHERE code = 'TK'");
  const [[unitINF]]   = await db.query("SELECT id FROM organization_units WHERE code = 'INF'");
  const [[statTK]]    = await db.query("SELECT id FROM employment_statuses WHERE name = 'Tenaga Kependidikan'");
  const [[statDosen]] = await db.query("SELECT id FROM employment_statuses WHERE name = 'Dosen Tetap'");

  if (!unitSI || !unitTK || !unitINF || !statTK || !statDosen) {
    console.error('  ✗  Prerequisite (organization_units/employment_statuses) tidak lengkap');
    return;
  }

  const [[userPJ1]]      = await db.query("SELECT id FROM users WHERE email = 'pj1@unand.ac.id'");
  const [[userPJ2]]      = await db.query("SELECT id FROM users WHERE email = 'pj2@unand.ac.id'");
  const [[userPJ3]]      = await db.query("SELECT id FROM users WHERE email = 'pj3@unand.ac.id'");
  const [[userPengguna3]]= await db.query("SELECT id FROM users WHERE email = 'pengguna3@unand.ac.id'");
  const [[userPengelola]]= await db.query("SELECT id FROM users WHERE email = 'pengelola@unand.ac.id'");

  const employees = [
    {
      userId: userPJ1?.id,
      employee_number: 'EMP001',
      name: 'Andi Kurniawan',
      birth_place: 'Padang',
      birth_date: '1980-04-12',
      gender: 'male',
      marital_status: 'married',
      address: 'Jl. Kampus Unand No. 1, Padang',
      organization_unit_id: unitSI.id,
      hire_date: '2008-03-01',
      employment_status_id: statDosen.id,
    },
    {
      userId: userPJ2?.id,
      employee_number: 'EMP002',
      name: 'Sari Wulandari',
      birth_place: 'Bukittinggi',
      birth_date: '1982-07-25',
      gender: 'female',
      marital_status: 'married',
      address: 'Jl. Limau Manis No. 5, Padang',
      organization_unit_id: unitTK.id,
      hire_date: '2009-08-01',
      employment_status_id: statDosen.id,
    },
    {
      userId: userPJ3?.id,
      employee_number: 'EMP003',
      name: 'Hendra Wijaya',
      birth_place: 'Solok',
      birth_date: '1979-11-03',
      gender: 'male',
      marital_status: 'married',
      address: 'Jl. Universitas No. 12, Padang',
      organization_unit_id: unitINF.id,
      hire_date: '2007-01-01',
      employment_status_id: statDosen.id,
    },
    {
      userId: userPengguna3?.id,
      employee_number: 'EMP004',
      name: 'Dian Pratiwi',
      birth_place: 'Payakumbuh',
      birth_date: '1985-02-17',
      gender: 'female',
      marital_status: 'single',
      address: 'Jl. Anduring No. 8, Padang',
      organization_unit_id: unitSI.id,
      hire_date: '2012-09-01',
      employment_status_id: statDosen.id,
    },
    {
      userId: userPengelola?.id,
      employee_number: 'EMP005',
      name: 'Budi Santoso',
      birth_place: 'Pariaman',
      birth_date: '1988-06-20',
      gender: 'male',
      marital_status: 'married',
      address: 'Jl. Perintis Kemerdekaan No. 3, Padang',
      organization_unit_id: unitSI.id,
      hire_date: '2014-01-01',
      employment_status_id: statTK.id,
    },
  ];

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

// ─── 9. STUDENTS ──────────────────────────────────────────────────────────────
// students.id = users.id (FK ke users)
// 2 mahasiswa: Rafa (pengguna1) dan Fuad (pengguna2)

async function seedStudents() {
  log('Seeding students...');

  const [[unitSI]]  = await db.query("SELECT id FROM organization_units WHERE code = 'SI'");
  const [[unitTK]]  = await db.query("SELECT id FROM organization_units WHERE code = 'TK'");

  const [[userRafa]] = await db.query("SELECT id FROM users WHERE email = 'pengguna1@unand.ac.id'");
  const [[userFuad]] = await db.query("SELECT id FROM users WHERE email = 'pengguna2@unand.ac.id'");

  const students = [
    {
      userId: userRafa?.id,
      name: 'Rafa Ardian',
      regno: '2210953001',
      email: 'pengguna1@unand.ac.id',
      campus_email: '2210953001@student.unand.ac.id',
      birth_date: '2003-05-14',
      birth_place: 'Padang',
      gender: 1,
      department_id: unitSI?.id ?? null,
      year: 2022,
    },
    {
      userId: userFuad?.id,
      name: 'Fuad Maulana',
      regno: '2210951042',
      email: 'pengguna2@unand.ac.id',
      campus_email: '2210951042@student.unand.ac.id',
      birth_date: '2003-08-29',
      birth_place: 'Bukittinggi',
      gender: 1,
      department_id: unitTK?.id ?? null,
      year: 2022,
    },
  ];

  await db.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const s of students) {
    if (!s.userId) { warn(`User untuk student ${s.name} tidak ditemukan, lewati`); continue; }

    const [rows] = await db.query('SELECT id FROM students WHERE regno = ?', [s.regno]);
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO students
           (id, name, regno, email, campus_email, birth_date, birth_place, gender,
            department_id, year, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          s.userId, s.name, s.regno, s.email, s.campus_email,
          s.birth_date, s.birth_place, s.gender, s.department_id, s.year,
        ]
      );
      ok(`Student "${s.name}" (${s.regno}) dibuat (id=${s.userId})`);
    } else {
      skip(`Student "${s.name}" (${s.regno})`);
    }
  }

  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}

// ─── 10. ASSETS ───────────────────────────────────────────────────────────────
// 10 ruangan sesuai spesifikasi per departemen

async function seedAssets() {
  log('Seeding assets...');
  const assets = [
    // Departemen Sistem Informasi (4 ruangan)
    { name: 'Ruang Seminar DSI',                                                         code: 'AST-DSI-SEM',   type: 'room', acquisition_type: 'procurement', acquisition_date: '2018-01-01', condition: 'good', status: 'in_use' },
    { name: 'Laboratorium Rekayasa Data & Business Intelligence (RDBI)',                  code: 'AST-DSI-RDBI',  type: 'room', acquisition_type: 'procurement', acquisition_date: '2019-01-01', condition: 'good', status: 'in_use' },
    { name: 'Laboratorium System Enterprise (SE)',                                        code: 'AST-DSI-SE',    type: 'room', acquisition_type: 'procurement', acquisition_date: '2019-06-01', condition: 'good', status: 'in_use' },
    { name: 'Laboratorium Tata Kelola dan Infrastruktur Teknologi Informasi (TKITI)',     code: 'AST-DSI-TKITI', type: 'room', acquisition_type: 'procurement', acquisition_date: '2020-01-01', condition: 'good', status: 'in_use' },
    // Departemen Teknik Komputer (4 ruangan)
    { name: 'Ruang Seminar Tekkom',                                                      code: 'AST-TK-SEM',    type: 'room', acquisition_type: 'procurement', acquisition_date: '2018-01-01', condition: 'good', status: 'in_use' },
    { name: 'Laboratory Komputer & Jaringan (LKJ)',                                      code: 'AST-TK-LKJ',    type: 'room', acquisition_type: 'procurement', acquisition_date: '2019-01-01', condition: 'good', status: 'in_use' },
    { name: 'Robotic & Embedded System Laboratory (Reslab)',                              code: 'AST-TK-RESLAB', type: 'room', acquisition_type: 'procurement', acquisition_date: '2019-06-01', condition: 'good', status: 'in_use' },
    { name: 'Laboratory Sistem Digital dan Arsitektur Komputer (Digikom)',                code: 'AST-TK-DIGI',   type: 'room', acquisition_type: 'procurement', acquisition_date: '2020-01-01', condition: 'good', status: 'in_use' },
    // Departemen Informatika (2 ruangan)
    { name: 'Ruang Seminar Informatika',                                                 code: 'AST-INF-SEM',   type: 'room', acquisition_type: 'procurement', acquisition_date: '2018-01-01', condition: 'good', status: 'in_use' },
    { name: 'Laboratory Komputer Informatika (LKI)',                                     code: 'AST-INF-LKI',   type: 'room', acquisition_type: 'procurement', acquisition_date: '2019-01-01', condition: 'good', status: 'in_use' },
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

// ─── 11. ROOMS ────────────────────────────────────────────────────────────────
// Setiap ruangan terhubung ke gedung & penanggung jawab departemennya
// pj1 → Dept. SI | pj2 → Dept. TK | pj3 → Dept. Informatika
// employee_id (pengelola/operator) diisi dengan EMP005 (Budi Santoso / pengelola_aset)

async function seedRooms() {
  log('Seeding rooms...');

  const [[gdSI]]  = await db.query("SELECT id FROM buildings WHERE code = 'GDSI'");
  const [[gdTK]]  = await db.query("SELECT id FROM buildings WHERE code = 'GDTK'");
  const [[gdINF]] = await db.query("SELECT id FROM buildings WHERE code = 'GDINF'");

  const [[empPJ1]]      = await db.query("SELECT id FROM employees WHERE employee_number = 'EMP001'");
  const [[empPJ2]]      = await db.query("SELECT id FROM employees WHERE employee_number = 'EMP002'");
  const [[empPJ3]]      = await db.query("SELECT id FROM employees WHERE employee_number = 'EMP003'");
  const [[empPengelola]]= await db.query("SELECT id FROM employees WHERE employee_number = 'EMP005'");

  if (!gdSI || !gdTK || !gdINF || !empPJ1 || !empPJ2 || !empPJ3 || !empPengelola) {
    console.error('  ✗  Prerequisite (buildings/employees) tidak lengkap untuk rooms');
    return;
  }

  // Helper: ambil asset_id berdasarkan code
  const getAsset = async (code) => {
    const [[a]] = await db.query('SELECT id FROM assets WHERE code = ?', [code]);
    return a;
  };

  const rooms = [
    // ── Departemen Sistem Informasi ──
    {
      asset_code: 'AST-DSI-SEM',
      building_id: gdSI.id,
      name: 'Ruang Seminar DSI',
      code: 'RM-DSI-SEM',
      floor: '2',
      capacity: 60,
      is_public: 1,
      responsible_employee_id: empPJ1.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-DSI-RDBI',
      building_id: gdSI.id,
      name: 'Laboratorium Rekayasa Data & Business Intelligence (RDBI)',
      code: 'RM-DSI-RDBI',
      floor: '1',
      capacity: 35,
      is_public: 0,
      responsible_employee_id: empPJ1.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-DSI-SE',
      building_id: gdSI.id,
      name: 'Laboratorium System Enterprise (SE)',
      code: 'RM-DSI-SE',
      floor: '1',
      capacity: 35,
      is_public: 0,
      responsible_employee_id: empPJ1.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-DSI-TKITI',
      building_id: gdSI.id,
      name: 'Laboratorium Tata Kelola dan Infrastruktur Teknologi Informasi (TKITI)',
      code: 'RM-DSI-TKITI',
      floor: '1',
      capacity: 30,
      is_public: 0,
      responsible_employee_id: empPJ1.id,
      employee_id: empPengelola.id,
    },
    // ── Departemen Teknik Komputer ──
    {
      asset_code: 'AST-TK-SEM',
      building_id: gdTK.id,
      name: 'Ruang Seminar Tekkom',
      code: 'RM-TK-SEM',
      floor: '2',
      capacity: 60,
      is_public: 1,
      responsible_employee_id: empPJ2.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-TK-LKJ',
      building_id: gdTK.id,
      name: 'Laboratory Komputer & Jaringan (LKJ)',
      code: 'RM-TK-LKJ',
      floor: '1',
      capacity: 40,
      is_public: 0,
      responsible_employee_id: empPJ2.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-TK-RESLAB',
      building_id: gdTK.id,
      name: 'Robotic & Embedded System Laboratory (Reslab)',
      code: 'RM-TK-RESLAB',
      floor: '1',
      capacity: 30,
      is_public: 0,
      responsible_employee_id: empPJ2.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-TK-DIGI',
      building_id: gdTK.id,
      name: 'Laboratory Sistem Digital dan Arsitektur Komputer (Digikom)',
      code: 'RM-TK-DIGI',
      floor: '1',
      capacity: 35,
      is_public: 0,
      responsible_employee_id: empPJ2.id,
      employee_id: empPengelola.id,
    },
    // ── Departemen Informatika ──
    {
      asset_code: 'AST-INF-SEM',
      building_id: gdINF.id,
      name: 'Ruang Seminar Informatika',
      code: 'RM-INF-SEM',
      floor: '2',
      capacity: 60,
      is_public: 1,
      responsible_employee_id: empPJ3.id,
      employee_id: empPengelola.id,
    },
    {
      asset_code: 'AST-INF-LKI',
      building_id: gdINF.id,
      name: 'Laboratory Komputer Informatika (LKI)',
      code: 'RM-INF-LKI',
      floor: '1',
      capacity: 40,
      is_public: 0,
      responsible_employee_id: empPJ3.id,
      employee_id: empPengelola.id,
    },
  ];

  for (const room of rooms) {
    const asset = await getAsset(room.asset_code);
    const [rows] = await db.query('SELECT id FROM rooms WHERE code = ?', [room.code]);
    if (rows.length === 0) {
      await db.query(
        `INSERT INTO rooms
           (asset_id, building_id, name, code, floor, capacity, is_public,
            responsible_employee_id, employee_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          asset?.id, room.building_id, room.name, room.code, room.floor,
          room.capacity, room.is_public, room.responsible_employee_id, room.employee_id,
        ]
      );
      ok(`Room "${room.name}" (${room.code}) dibuat`);
    } else {
      await db.query(
        'UPDATE rooms SET responsible_employee_id = ? WHERE code = ?',
        [room.responsible_employee_id, room.code]
      );
      skip(`Room "${room.name}" (${room.code})`);
    }
  }
}

// ─── 12. MODEL_HAS_ROLES ──────────────────────────────────────────────────────

async function seedModelHasRoles() {
  log('Seeding model_has_roles...');
  const assignments = [
    { email: 'pengguna1@unand.ac.id', roleName: 'pengguna' },
    { email: 'pengguna2@unand.ac.id', roleName: 'pengguna' },
    { email: 'pengguna3@unand.ac.id', roleName: 'pengguna' },
    { email: 'pj1@unand.ac.id',       roleName: 'penanggung_jawab' },
    { email: 'pj2@unand.ac.id',       roleName: 'penanggung_jawab' },
    { email: 'pj3@unand.ac.id',       roleName: 'penanggung_jawab' },
    { email: 'pengelola@unand.ac.id', roleName: 'pengelola_aset' },
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


// ─── 0. PATCH FOREIGN KEYS ────────────────────────────────────────────────────
// Mengubah FK reported_by & logged_by dari → employees menjadi → users,
// agar mahasiswa (yang hanya ada di tabel students) bisa membuat laporan.
// Fungsi ini idempotent: cek dulu apakah FK sudah mengarah ke users sebelum diubah.

async function patchForeignKeys() {
  log('Patching foreign keys...');

  // ── room_maintenance_requests.reported_by ──────────────────────────────────
  const [[fk1]] = await db.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA         = DATABASE()
      AND TABLE_NAME           = 'room_maintenance_requests'
      AND COLUMN_NAME          = 'reported_by'
      AND REFERENCED_TABLE_NAME = 'employees'
  `);

  if (fk1) {
    await db.query(`ALTER TABLE room_maintenance_requests DROP FOREIGN KEY ${fk1.CONSTRAINT_NAME}`);
    await db.query(`
      ALTER TABLE room_maintenance_requests
        ADD CONSTRAINT room_maintenance_requests_reported_by_foreign
        FOREIGN KEY (reported_by) REFERENCES users(id)
    `);
    ok('FK room_maintenance_requests.reported_by → users(id)');
  } else {
    skip('FK room_maintenance_requests.reported_by sudah mengarah ke users');
  }

  // ── room_maintenance_request_log.logged_by ────────────────────────────────
  const [[fk2]] = await db.query(`
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA         = DATABASE()
      AND TABLE_NAME           = 'room_maintenance_request_log'
      AND COLUMN_NAME          = 'logged_by'
      AND REFERENCED_TABLE_NAME = 'employees'
  `);

  if (fk2) {
    await db.query(`ALTER TABLE room_maintenance_request_log DROP FOREIGN KEY ${fk2.CONSTRAINT_NAME}`);
    await db.query(`
      ALTER TABLE room_maintenance_request_log
        ADD CONSTRAINT fk_room_maintenance_request_log_employees1
        FOREIGN KEY (logged_by) REFERENCES users(id)
    `);
    ok('FK room_maintenance_request_log.logged_by → users(id)');
  } else {
    skip('FK room_maintenance_request_log.logged_by sudah mengarah ke users');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SEED DATABASE — Maintenance Ruangan FTI Unand               ');
  console.log('═══════════════════════════════════════════════════════════════');

  try {
    // PENTING: patch FK dijalankan PERTAMA sebelum insert data apapun
    await patchForeignKeys();
    await seedRoles();
    await seedPermissions();
    await seedRolePermissions();
    await seedBuildings();
    await seedEmploymentStatuses();
    await seedOrganizationUnits();
    // PENTING: users dulu sebelum employees & students (FK → users.id)
    await seedUsers();
    await seedEmployees();
    await seedAssets();
    await seedRooms();
    await seedStudents();
    await seedModelHasRoles();

    console.log('');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  ✓  Seed selesai!                                            ');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    console.log('  Akun testing:');
    console.log('  ┌────────────────────────────┬─────────────┬──────────────────────┐');
    console.log('  │ Email                       │ Password    │ Role                 │');
    console.log('  ├────────────────────────────┼─────────────┼──────────────────────┤');
    console.log('  │ pengguna1@unand.ac.id       │ password123 │ pengguna (mahasiswa) │');
    console.log('  │ pengguna2@unand.ac.id       │ password123 │ pengguna (mahasiswa) │');
    console.log('  │ pengguna3@unand.ac.id       │ password123 │ pengguna (dosen)     │');
    console.log('  │ pj1@unand.ac.id             │ password123 │ penanggung_jawab     │');
    console.log('  │ pj2@unand.ac.id             │ password123 │ penanggung_jawab     │');
    console.log('  │ pj3@unand.ac.id             │ password123 │ penanggung_jawab     │');
    console.log('  │ pengelola@unand.ac.id       │ password123 │ pengelola_aset       │');
    console.log('  └────────────────────────────┴─────────────┴──────────────────────┘');
    console.log('');
    console.log('  Pembagian tanggung jawab ruangan:');
    console.log('  ┌─────────────────────┬────────────────────────────────────────────────────┐');
    console.log('  │ Penanggung Jawab     │ Ruangan                                            │');
    console.log('  ├─────────────────────┼────────────────────────────────────────────────────┤');
    console.log('  │ pj1 (Andi Kurniawan) │ Dept. Sistem Informasi: Seminar DSI, Lab RDBI,    │');
    console.log('  │                     │ Lab SE, Lab TKITI                                  │');
    console.log('  │ pj2 (Sari Wulandari) │ Dept. Teknik Komputer: Seminar Tekkom, Lab LKJ,  │');
    console.log('  │                     │ Reslab, Lab Digikom                                │');
    console.log('  │ pj3 (Hendra Wijaya) │ Dept. Informatika: Seminar Informatika, Lab LKI   │');
    console.log('  └─────────────────────┴────────────────────────────────────────────────────┘');
    console.log('');

  } catch (err) {
    console.error('\n  ✗  Error saat seeding:', err.message);
    console.error(err);
    await db.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    process.exit(1);
  } finally {
    await db.end();
    process.exit(0);
  }
}

main();
