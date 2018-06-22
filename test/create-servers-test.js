/*
 * create-servers-test.js: Make sure creating both works
 *
 * (C) 2013, Charlie Robbins.
 *
 */

var path = require('path'),
    fs = require('fs'),
    http = require('http'),
    https = require('https'),
    test = require('tape'),
    sinon = require('sinon'),
    createServers = require('../');

//
// Immediately end a response.
//
function fend(req, res) {
  res.end();
}

test('only http', function (t) {
  t.plan(3);
  createServers({
    log: console.log,
    http: 9876,
    handler: fend
  }, function (err, servers) {
    console.dir(err);
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
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
  t.plan(3);
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: path.join(__dirname, 'fixtures'),
      cert: 'agent2-cert.pem',
      key:  'agent2-key.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.https, 'object');
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
      cert: 'agent2-cert.pem',
      key:  'agent2-key.pem'
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

test('absolute cert path resolution', function (t) {
  t.plan(3);
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: '/',
      cert: path.resolve(__dirname, 'fixtures', 'agent2-cert.pem'),
      key:  path.resolve(__dirname, 'fixtures', 'agent2-key.pem')
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
      cert: 'agent2-cert.pem',
      key:  'agent2-key.pem'
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

test('provides useful debug information', function (t) {
  t.plan(5);
  createServers({
    log: console.log,
    https: {
      port: 443,
      root: path.join(__dirname, 'fixtures'),
      cert: 'agent2-cert.pem',
      key:  'agent2-key.pem'
    },
    handler: fend
  }, function (err, servers) {
    t.equals(typeof servers, 'object');
    t.equals(typeof err, 'object');
    t.equals(typeof err.https, 'object');
    t.equals(typeof err.message, 'string');
    t.notEqual(err.message, 'Unspecified error');
  });
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
      cert: 'agent2-cert.pem',
      key:  'agent2-key.pem'
    },
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
      cert: fs.readFileSync(path.resolve(root, 'agent2-cert.pem')),
      key:  fs.readFileSync(path.resolve(root, 'agent2-key.pem'))
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
      cert: [fs.readFileSync(path.resolve(root, 'agent2-cert.pem'))],
      key:  fs.readFileSync(path.resolve(root, 'agent2-key.pem'))
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
  var intermediate = fs.readFileSync(path.resolve(root, 'intermediate-cert.pem'));
  var spy = sinon.spy(https, 'createServer');
  createServers({
    log: console.log,
    https: {
      port: 3456,
      root: root,
      cert: ['agent3-cert.pem', 'intermediate-cert.pem'],
      key:  'agent3-key.pem'
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
      port:        3456,
      root:        path.join(__dirname, 'fixtures'),
      cert:        'agent2-cert.pem',
      key:         'agent2-key.pem',
      requestCert: true
    },
    handler: fend
  }, function (err, servers) {
    t.error(err);
    t.equals(spy.lastCall.args[0].requestCert, true, 'should preserve the requestCert option');
    servers.https.close();
    spy.restore();
  });
});
