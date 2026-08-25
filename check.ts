import { initDatabaseTables, getDbPool } from './server/db.js';

async function check() {
  try {
    const pool = await getDbPool();
    if (pool) {
      await initDatabaseTables(pool);
      const res = await pool.query('SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\';');
      console.log('Tables:', res.rows.map(r => r.table_name));
    }
  } catch (err) {
    console.error(err);
  }
}
check().then(() => process.exit(0));
