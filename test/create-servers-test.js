/*
 * create-servers-test.js: Make sure creating both works
 *
 * (C) 2013, Charlie Robbins.
 *
 */

var path = require('path'),
  fs = require('fs'),
  url = require('url'),
  http = require('http'),
  https = require('https'),
  http2 = require('http2'),
  { promisify } = require('util'),
  test = require('tape'),
  sinon = require('sinon'),
  evilDNS = require('evil-dns'),
  createServers = require('../');

const createServersAsync = promisify(createServers);

const { HTTP2_HEADER_PATH } = http2.constants;

const ca = fs.readFileSync(path.join(__dirname, './fixtures/example-ca-cert.pem'));

//
// Immediately end a response.
//
function fend(req, res) {
  res.end();
}

//
// Request and download response from a URL
//
async function download(httpsURL) {
  return new Promise((resolve, reject) => {
    const req = https.get({
      ...url.parse(httpsURL),
      ca
    }, res => {
      const chunks = [];
      res
        .on('data', chunk => chunks.push(chunk))
        .once('end', () => {
          resolve(chunks.map(chunk => chunk.toString('utf8')).join(''));
        })
        .once('aborted', reject)
        .once('close', reject)
        .once('error', reject);
    });
    req.once('error', reject);
  });
}

//
// Request and download response from a URL using HTTP/2
//
async function download2(httpsURL) {
  return new Promise((resolve, reject) => {
    const clientSession = http2.connect(httpsURL);
    const fail = results => {
      clientSession.close();
      reject(results);
    };

    const req = clientSession.request({ [HTTP2_HEADER_PATH]: '/' });
    req.on('response', () => {
      const chunks = [];
      req
        .on('data', chunk => chunks.push(chunk))
        .once('end', () => {
          resolve(chunks.map(chunk => chunk.toString('utf8')).join(''));
          clientSession.close();
        });
    })
      .once('aborted', fail)
      .once('close', fail)
      .once('error', fail);
  });
}

/**
 * Helper to start a server with HTTP/2 support.
 * Returns stop function to handle server and dns cleanup after tests.
 *
 * Tests requests can be made to foo.example.org:3456
 *
 * @param {object} options - Additional http2 server options.
 * @returns {Promise<(function(): void)|*>} callback
 */
async function startHttp2Server(options = {}) {
  // disabling to avoid UNABLE_TO_VERIFY_LEAF_SIGNATURE for tests
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  const servers = await createServersAsync({
    http2: {
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem',
      ...options
    },
    handler: (req, res) => {
      const { httpVersion } = req;
      const { socket: { alpnProtocol } } = httpVersion === '2.0' ? req.stream.session : req;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        alpnProtocol,
        httpVersion
      }));
    }
  });

  evilDNS.add('foo.example.org', '0.0.0.0');

  return function stop() {
    servers && servers.http2 && servers.http2.close();
    evilDNS.clear();
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  };
}

test('only http', function (t) {
  t.plan(5);
  createServers({
    log: console.log,
    http: 9876,
    handler: fend
  }, function (err, servers) {
    console.dir(err);
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(servers.http instanceof Array, false);
    t.equals(servers.https, undefined);
    servers.http.close();
  });
});

test('only http, port 0', function (t) {
  t.plan(4);
  createServers({
    log: console.log,
    http: 0,
    handler: fend
  }, function (err, servers) {
    console.dir(err);
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(typeof servers.http.address().port, 'number');
    servers.http.close();
  });
});

test('only http, timeout', function (t) {
  t.plan(5);
  var time = 3000000;
  createServers({
    log: console.log,
    timeout: time,
    http: 0,
    handler: fend
  }, function (err, servers) {
    console.dir(err);
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(typeof servers.http.address().port, 'number');
    t.equals(servers.http.timeout, time);
    servers.http.close();
  });
});

test('only https', function (t) {
  t.plan(5);
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.https, 'object');
    t.equals(servers.https instanceof Array, false);
    t.equals(servers.http, undefined);
    servers.https.close();
  });
});

test('only https', function (t) {
  t.plan(4);
  var time = 4000000;
  createServers({
    log: console.log,
    https: {
      timeout: time,
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.https, 'object');
    t.equals(servers.https.timeout, time);
    servers.https.close();
  });
});

test('only http2', function (t) {
  t.plan(4);
  var time = 4000000;
  createServers({
    log: console.log,
    http2: {
      timeout: time,
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http2, 'object');
    t.equals(servers.http2.timeout, time);
    servers.http2.close();
  });
});

test('absolute cert path resolution', function (t) {
  t.plan(3);
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: '/',
      cert: path.resolve(__dirname, 'fixtures', 'example-org-cert.pem'),
      key: path.resolve(__dirname, 'fixtures', 'example-org-key.pem')
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.https, 'object');
    servers.https.close();
  });
});

test('http && https', function (t) {
  t.plan(4);
  createServers({
    log: console.log,
    http: 8765,
    https: {
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(typeof servers.https, 'object');
    servers.http.close();
    servers.https.close();
  });
});

test('provides useful debug information', async function (t) {
  t.plan(4);

  const config = {
    log: console.log,
    https: {
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    },
    handler: fend
  };

  // Simulate a "port in use" error
  const { https: server1 } = await createServersAsync(config);

  try {
    await createServersAsync(config);
  } catch (err) {
    t.equals(typeof err, 'object');
    t.equals(typeof err.https, 'object');
    t.equals(typeof err.message, 'string');
    t.notEqual(err.message, 'Unspecified error');
  } finally {
    server1.close();
  }
});

test('http && https with different handlers', function (t) {
  t.plan(4);
  createServers({
    log: console.log,
    http: {
      handler: function (req, res) {
        res.end('http');
      },
      port: 8765
    },
    https: {
      handler: function (req, res) {
        res.end('https');
      },
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    }
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(typeof servers.https, 'object');
    servers.http.close();
    servers.https.close();
  });

  test('only http with string type input for http port', function (t) {
    t.plan(3);
    createServers({
      log: console.log,
      http: '9876',
      handler: fend
    }, function (err, servers) {
      t.error(err);
      t.equals(typeof servers, 'object');
      t.equals(typeof servers.http, 'object');
      servers.http.close();
    });
  });

  test('host can be provided to the server', function (t) {
    t.plan(4);
    createServers({
      log: console.log,
      http: {
        port: 9877,
        host: '127.0.0.1'
      },
      handler: fend
    }, function (err, servers) {
      t.error(err);
      t.equals(typeof servers, 'object');
      t.equals(typeof servers.http, 'object');
      t.equals(servers.http.address().address, '127.0.0.1');

      servers.http.close();
    });
  });
});

test('supports cert contents instead of cert paths', function (t) {
  t.plan(3);
  var root = path.join(__dirname, 'fixtures');
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: root,
      cert: fs.readFileSync(path.resolve(root, 'example-org-cert.pem')),
      key: fs.readFileSync(path.resolve(root, 'example-org-key.pem'))
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.https, 'object');
    servers.https.close();
  });
});

test('supports cert array instead of strings', function (t) {
  t.plan(3);
  var root = path.join(__dirname, 'fixtures');
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: root,
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.https, 'object');
    servers.https.close();
  });
});

test('supports creating certificate chains', function (t) {
  t.plan(2);
  var root = path.join(__dirname, 'fixtures');
  var agent3Cert = fs.readFileSync(path.resolve(root, 'agent3-cert.pem'));
  var intermediate = fs.readFileSync(
    path.resolve(root, 'intermediate-cert.pem')
  );
  var spy = sinon.spy(https, 'createServer');
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: root,
      cert: ['agent3-cert.pem', 'intermediate-cert.pem'],
      key: 'agent3-key.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);

    const expectedBundle = [agent3Cert, intermediate].join('\n');
    const cert = spy.lastCall.args[0].cert;
    t.equals(cert, expectedBundle, 'should create a cert chain');

    servers.https.close();
    spy.restore();
  });
});

test('supports requestCert https option', function (t) {
  t.plan(2);
  var spy = sinon.spy(https, 'createServer');
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem',
      requestCert: true
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(
      spy.lastCall.args[0].requestCert,
      true,
      'should preserve the requestCert option'
    );
    servers.https.close();
    spy.restore();
  });
});

test('supports SNI', async t => {
  await testSni(t, {
    'example.com': {
      key: 'example-com-key.pem',
      cert: 'example-com-cert.pem'
    },
    'example.net': {
      key: 'example-net-key.pem',
      cert: 'example-net-cert.pem'
    },
    '*.example.org': {
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    }
  }, ['example.com', 'example.net', 'foo.example.org']);
});

test('supports catch-all * for SNI', async t => {
  await testSni(t, {
    'example.com': {
      key: 'example-com-key.pem',
      cert: 'example-com-cert.pem'
    },
    '*': {
      key: 'example-org-key.pem',
      cert: 'example-org-cert.pem'
    }
  }, ['example.com', 'foo.example.org']);
});

test('multiple https servers', async function (t) {
  t.plan(2);

  evilDNS.add('foo.example.org', '0.0.0.0');
  const servers = await createServersAsync({
    log: console.log,
    https: [
      {
        port: 3456,
        root: path.join(__dirname, 'fixtures'),
        key: 'example-org-key.pem',
        cert: 'example-org-cert.pem'
      },
      {
        port: 6543,
        root: path.join(__dirname, 'fixtures'),
        key: 'example-org-key.pem',
        cert: 'example-org-cert.pem'
      }
    ],
    handler: (req, res) => {
      res.end('Hello');
    }
  });

  try {
    t.equals(servers.https.length, 2, 'two servers were created');
    const responses = await Promise.all([
      download('https://foo.example.org:3456/'),
      download('https://foo.example.org:6543/')
    ]);
    t.equals(
      responses.every(str => str === 'Hello'),
      true,
      'responses are as expected'
    );
  } finally {
    let toClose =
      servers.https instanceof Array ? servers.https : [servers.https];
    toClose.forEach(server => server.close());
    evilDNS.clear();
  }
});

test('supports http2-only requests', async function (t) {
  t.plan(2);
  const url = 'https://foo.example.org:3456/';

  let stopServer;
  try {
    stopServer = await startHttp2Server({});

    const httpsResponse = await download(url);
    t.ok(httpsResponse.includes('Unknown ALPN Protocol'));

    const response = JSON.parse(await download2(url));
    t.equals(response.httpVersion, '2.0');

  } catch (err) {
    t.error(err);
  } finally {
    stopServer && stopServer();
  }
});

test('supports http2 and https requests', async function (t) {
  t.plan(2);
  const url = 'https://foo.example.org:3456/';

  let stopServer;
  try {
    stopServer = await startHttp2Server({
      allowHTTP1: true
    });

    const httpsResponse = JSON.parse(await download(url));
    t.equals(httpsResponse.httpVersion, '1.1');

    const response = JSON.parse(await download2(url));
    t.equals(response.httpVersion, '2.0');

  } catch (err) {
    t.error(err);
  } finally {
    stopServer && stopServer();
  }
});

async function testSni(t, sniConfig, hostNames) {
  t.plan(1);

  let httpsServer;
  try {
    const servers = await createServersAsync({
      https: {
        port: 3456,
        root: path.join(__dirname, 'fixtures'),
        sni: sniConfig
      },
      handler: (req, res) => {
        res.write('Hello');
        res.end();
      }
    });
    httpsServer = servers.https;

    hostNames.forEach(host => evilDNS.add(host, '0.0.0.0'));

    const responses = await Promise.all(
      hostNames.map(hostname => download(`https://${hostname}:3456/`))
    );

    t.equals(
      responses.every(str => str === 'Hello'),
      true,
      'responses are as expected'
    );
  } catch (err) {
    return void t.error(err);
  } finally {
    httpsServer && httpsServer.close();
    evilDNS.clear();
  }
}
