/*
 * create-servers-test.js: Make sure creating both works
 *
 * (C) 2013, Charlie Robbins.
 *
 */

var path = require('path'),
    http = require('http'),
    test = require('tape'),
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
