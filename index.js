/*
 * index.js: Create an http AND/OR an https server and call the same request handler.
 *
 * (C) 2013, Charlie Robbins.
 *
 */

var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    path = require('path'),
    connected = require('connected'),
    errs = require('errs');

//
// ### function createServers (dispatch, options, callback)
// Creates and listens on both HTTP and HTTPS servers.
//
module.exports = function createServers(options, listening) {
  if (!options || (!options.http && !options.https)
      || (!options.handler && !options.http.handler && !options.https.handler)) {
    return listening(new Error('handler, http and/or https are required options.'));
  }

  var handler = options.handler,
      log     = options.log || function () { },
      errors  = {},
      servers = {},
      errState;

  //
  // ### function onListen(type, err, server)
  // Responds to the `listening` callback if necessary
  // with the appropriate servers.
  //
  function onListen(type, err, server) {
    servers[type] = server || true;
    if (err) {
      errors[type] = err;
    }

    if (servers.http && servers.https) {
      Object.keys(servers)
        .forEach(function (key) {
          if (typeof servers[key] === 'boolean') {
            delete servers[key];
          }
        })

      if (errors.http || errors.https) {
        return listening(errs.create({
          https: errors.https,
          http:  errors.http,
        }), servers);
      }

      listening(undefined, servers);
    }
  }

  //
  // ### function createHttp ()
  // Attempts to create and listen on the the HTTP server.
  //
  function createHttp() {
    if (!options.http) {
      log('http | no options.http; no server')
      return onListen('http');
    }

    if (typeof options.http !== 'object') {
      options.http = {
        port: typeof options.http === 'number'
          ? options.http
          : false
      };
    }

    var server = http.createServer(options.http.handler || handler),
        port   = options.http.port || 80;

    log('http | try listen ' + port);
    connected(server, port, function (err) {
      onListen('http', err, this);
    });
  }

  //
  // ### function createHttps ()
  // Attempts to create and listen on the HTTPS server.
  //
  function createHttps(next) {
    if (!options.https) {
      log('https | no options.https; no server')
      return onListen('https');
    }

    var port = options.https.port || 443,
        ssl  = options.https,
        server;

    if (ssl.ca && !Array.isArray(ssl.ca)) {
      ssl.ca = [ssl.ca];
    }

    log('https | listening on %d', port);
    server = https.createServer({
      key:  fs.readFileSync(path.join(ssl.root, ssl.key)),
      cert: fs.readFileSync(path.join(ssl.root, ssl.cert)),
      ca:   ssl.ca && ssl.ca.map(
        function (file) {
          return fs.readFileSync(path.join(ssl.root, file));
        }
      )
    }, ssl.handler || handler);

    connected(server, port, function (err) {
      onListen('https', err, this);
    });
  }

  [createHttp, createHttps]
    .forEach(function (fn) { fn(); });
};