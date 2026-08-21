process.loadEnvFile();
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();
const { rows } = await c.query("select id from conversations where visitor_id='nullbyte-probe'");
console.log('разговоров сохранено:', rows.length);
const u = await c.query("select messages from usage_daily where day = current_date");
console.log('usage_daily:', JSON.stringify(u.rows));
await c.end();
