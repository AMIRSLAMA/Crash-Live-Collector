const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

async function freePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  return port;
}

test('GET /health returns healthy JSON from the running service', async () => {
  const port = await freePort();
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore'
  });

  try {
    let response;
    for (let attempt = 0; attempt < 30; attempt++) {
      try {
        response = await fetch(`http://127.0.0.1:${port}/health`);
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.ok(response, 'server should start and respond within 3 seconds');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      status: 'ok',
      service: 'crash-live-collector-starter'
    });
  } finally {
    child.kill('SIGTERM');
  }
});
