const { Pool } = require('C:/appiw/node_modules/.pnpm/pg@8.20.0/node_modules/pg');
const url = process.env.U;
async function run(n, max) {
  const p = new Pool({ connectionString: url, max, connectionTimeoutMillis: 5000 });
  const t0 = Date.now();
  let ok = 0,
    fail = 0;
  const lat = [];
  await Promise.all(
    Array.from({ length: n }, async () => {
      const s = Date.now();
      let c;
      try {
        c = await p.connect();
        await c.query('BEGIN');
        await c.query('SELECT 1');
        await new Promise((r) => setTimeout(r, 20));
        const c2 = await p.connect();
        await c2.query('BEGIN');
        await c2.query('SELECT 1');
        await c2.query('COMMIT');
        c2.release();
        await c.query('COMMIT');
        ok++;
      } catch (e) {
        fail++;
        if (c) await c.query('ROLLBACK').catch(() => {});
      } finally {
        if (c) c.release();
        lat.push(Date.now() - s);
      }
    }),
  );
  lat.sort((a, b) => a - b);
  console.log(
    JSON.stringify({
      concurrentes: n,
      max,
      ok,
      fail,
      totalMs: Date.now() - t0,
      p50: lat[lat.length >> 1],
      maxMs: lat[lat.length - 1],
    }),
  );
  await p.end();
}
(async () => {
  for (const n of [5, 9, 10, 20]) await run(n, 10);
})();
