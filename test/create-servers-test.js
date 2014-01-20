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
    console.dir(err);
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
    console.dir(err);
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(typeof servers.https, 'object');
    servers.http.close();
    servers.https.close();
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
    console.dir(err);
    t.error(err);
    t.equals(typeof servers, 'object');
    t.equals(typeof servers.http, 'object');
    t.equals(typeof servers.https, 'object');
    servers.http.close();
    servers.https.close();
  });
});