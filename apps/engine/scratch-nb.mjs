process.loadEnvFile();
import pg from 'pg';
const c = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
await c.connect();
const { rows } = await c.query("select public_key, allowed_domains from tenants where status='active' limit 1");
console.log('key', rows[0].public_key, rows[0].allowed_domains);
await c.end();

const res = await fetch('http://localhost:3779/v1/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'https://' + rows[0].allowed_domains[0] },
  body: JSON.stringify({ publicKey: rows[0].public_key, visitorId: 'nullbyte-probe', message: 'Salut' + String.fromCharCode(0) + ' ce garantie oferiti?' }),
});
console.log('status', res.status);
const text = await res.text();
console.log(text.slice(0, 400));
