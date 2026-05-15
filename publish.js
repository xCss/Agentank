
const https = require('https');
const fs = require('fs');

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    })
);

const code = fs.readFileSync('new_tank.js', 'utf-8');
const data = JSON.stringify({
  code: code,
  notes: 'Restore tested v61 baseline and keep boost star tempo',
  submittedBy: 'Codex'
});

const req = https.request({
  hostname: 'agentank.ai',
  path: '/api/agent/tank/code',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${env.TANK_KEY}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    try {
      const parsed = JSON.parse(body);
      console.log(JSON.stringify({
        tankId: parsed.tank && parsed.tank.id,
        codeVersion: parsed.tank && parsed.tank.codeVersion,
        codeHash: parsed.tank && parsed.tank.codeHash,
        skillType: parsed.tank && parsed.tank.skillType,
      }, null, 2));
    } catch (error) {
      console.log('Body:', body.substring(0, 500));
    }
  });
});

req.on('error', e => console.error('Error:', e.message));
req.write(data);
req.end();
