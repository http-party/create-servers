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
module.exports = function createServers(options, handler, listening) {
  if (!options || (!options.http && !options.https)) {
    return listening(new Error('options.http and/or options.https are required.'));
  }

  var log     = options.log || function () { },
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

    var port = options.http || options.http.port || 80;
    log('http | try listen ' + port);

    connected(http.createServer(handler), port, function (err) {
      onListen('http', err, this);
    });
  }

  //
  // ### function createHttps ()
  // Attempts to create and listen on the HTTPS server.
  //
  function createHttps(next) {
    if (!options.https) {
      console.log('https | no options.https; no server')
      return onListen('https');
    }

    var port = options.https.port || 443,
        ssl  = options.https,
        server;

    if (ssl.ca && !Array.isArray(ssl.ca)) {
      ssl.ca = [ssl.ca];
    }

    console.log('https | listening on %d', port);
    server = https.createServer({
      key:  fs.readFileSync(path.join(ssl.root, ssl.key)),
      cert: fs.readFileSync(path.join(ssl.root, ssl.cert)),
      ca:   ssl.ca && ssl.ca.map(
        function (file) {
          return fs.readFileSync(path.join(ssl.root, file));
        }
      )
    }, handler);

    connected(server, port, function (err) {
      onListen('https', err, this);
    });
  }

  [createHttp, createHttps]
    .forEach(function (fn) { fn(); });
};