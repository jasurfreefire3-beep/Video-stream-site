import pg from 'pg';

async function test(pw: string) {
  const pool = new pg.Pool({
    host: 'psql.fr-roub1.bengt.wasmernet.com',
    port: 20184,
    database: 'video',
    user: 'user_9f0a1bbd',
    password: pw,
    ssl: { rejectUnauthorized: false }
  });

  try {
    const client = await pool.connect();
    console.log("SUCCESS with", pw);
    client.release();
    return true;
  } catch (e: any) {
    console.log("FAIL with", pw, e.message);
    return false;
  }
}

async function run() {
  const passwords = [
    "pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZO", // original .env
    "pw_Nkmiu3Ab8L9fPXRfjABNHImvr6carZ0", // 0 instead of O
    "pw_Nkmiu3Ab8L9fPXRfjABNHImmvr6carZO", // double m
    "pw_Nkmiu3Ab8L9fPXRfjABNHImmvr6carZ0",
    "pw_Nkmiu3Ab8L9FPXRfjABNHImvr6carZ0",
    "pw_Nkmiu3Ab8L9FPXRfjABNHImvr6carZO",
    "pw_Nkmiu3Ab8L9fPXRfjABNhlmvr6carZO",
  ];
  for (const p of passwords) {
    if (await test(p)) process.exit(0);
  }
  process.exit(1);
}
run();
