import { assertPublicUrl, blockedReason } from '../llm/ssrf.js';

const CASES: Array<[string, boolean, string]> = [
  ['https://example.com/api',              true,  'обычный публичный хост'],
  ['http://127.0.0.1:8080/admin',          false, 'петля'],
  ['http://localhost:5433/',               false, 'localhost резолвится в петлю'],
  ['http://169.254.169.254/latest/meta-data/', false, 'метаданные облака'],
  ['http://10.0.0.5/internal',             false, 'частная сеть 10/8'],
  ['http://172.16.0.1/',                   false, 'частная сеть 172.16/12'],
  ['http://192.168.1.1/',                  false, 'частная сеть 192.168/16'],
  ['http://[::1]:9000/',                   false, 'петля IPv6'],
  ['http://[::ffff:169.254.169.254]/',     false, 'IPv4-mapped, точечная форма'],
  ['http://[::ffff:a9fe:a9fe]/',           false, 'IPv4-mapped, шестнадцатеричная форма'],
  ['http://[::ffff:c0a8:0101]/',           false, 'IPv4-mapped 192.168.1.1'],
  ['http://[::ffff:8.8.8.8]/',             true,  'IPv4-mapped публичный адрес'],
  ['http://[fd00::1]/',                    false, 'unique local IPv6'],
  ['http://0.0.0.0/',                      false, 'этот хост'],
  ['http://100.64.0.1/',                   false, 'CGNAT'],
  ['http://2130706433/',                   false, 'десятичная запись 127.0.0.1'],
  ['file:///etc/passwd',                   false, 'схема file'],
  ['gopher://evil/',                       false, 'схема gopher'],
  ['http://192.168.1.1.nip.io/',           false, 'DNS-имя, указывающее в частную сеть'],
];

let failed = 0;
for (const [url, shouldPass, why] of CASES) {
  let passed: boolean;
  let detail = '';
  try {
    await assertPublicUrl(url);
    passed = true;
  } catch (err) {
    passed = false;
    detail = (err as Error).message;
  }
  const ok = passed === shouldPass;
  if (!ok) failed++;
  console.log(
    `${ok ? '  ok  ' : '  FAIL'} ${shouldPass ? 'разрешён' : 'заблокирован'}  ${url.padEnd(44)} ${why}${detail && !shouldPass ? '' : detail ? ` (${detail})` : ''}`,
  );
}
console.log(`\n${CASES.length - failed}/${CASES.length} проверок пройдено`);
console.log('прямая проверка адреса 169.254.169.254 →', blockedReason('169.254.169.254'));
process.exit(failed ? 1 : 0);
