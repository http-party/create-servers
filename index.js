'use strict';

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
    errs = require('errs'),
    assign = require('object-assign');

var pemFormat = /-----BEGIN/;

var CIPHERS = [
  'ECDHE-RSA-AES256-SHA384',
  'DHE-RSA-AES256-SHA384',
  'ECDHE-RSA-AES256-SHA256',
  'DHE-RSA-AES256-SHA256',
  'ECDHE-RSA-AES128-SHA256',
  'DHE-RSA-AES128-SHA256',
  'HIGH',
  '!aNULL',
  '!eNULL',
  '!EXPORT',
  '!DES',
  '!RC4',
  '!MD5',
  '!PSK',
  '!SRP',
  '!CAMELLIA'
].join(':');

/**
 * function createServers (dispatch, options, callback)
 * Creates and listens on both HTTP and HTTPS servers.
 */
module.exports = function createServers(options, listening) {
  if (!options || (!options.http && !options.https)
      || (!options.handler && !options.http.handler && !options.https.handler)) {
    return listening(new Error('handler, http and/or https are required options.'));
  }

  var handler = options.handler,
      log     = options.log || function () { },
      errors  = {},
      servers = {};

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
        });

      if (errors.http || errors.https) {
        return listening(errs.create({
          message: (errors.https || errors.http).message,
          https: errors.https,
          http:  errors.http
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
      log('http | no options.http; no server');
      return onListen('http');
    }

    if (typeof options.http !== 'object') {
      options.http = {
        // accept both a string and a number
        port: !isNaN(options.http)
          ? +options.http
          : false
      };
    }

    var server = http.createServer(options.http.handler || handler),
        port   = options.http.port || 80,
        args;

    args = [server, port];
    if (options.http.host) {
      args.push(options.http.host);
    }

    log('http | try listen ' + port);
    args.push(function listener(err) { onListen('http', err, this); });
    connected.apply(null, args);
  }

  //
  // ### function createHttps ()
  // Attempts to create and listen on the HTTPS server.
  //
  function createHttps(next) {
    if (!options.https) {
      log('https | no options.https; no server');
      return onListen('https');
    }

    var ssl  = options.https,
        port = +ssl.port || 443,
        ciphers = ssl.ciphers || CIPHERS,
        ca = ssl.ca,
        server,
        args;

    //
    // Remark: If an array is passed in lets join it like we do the defaults
    //
    if (Array.isArray(ciphers)) {
      ciphers = ciphers.join(':');
    }

    if (ca && !Array.isArray(ca)) {
      ca = [ca];
    }

    var finalHttpsOptions = assign({}, ssl, {
      //
      // Load default SSL key, cert and ca(s).
      //
      key: normalizeCertFile(ssl.root, ssl.key),
      cert: normalizeCertFile(ssl.root, ssl.cert),
      ca: ca && ca.map(normalizeCertFile.bind(null, ssl.root)),
      //
      // Properly expose ciphers for an A+ SSL rating:
      // https://certsimple.com/blog/a-plus-node-js-ssl
      //
      ciphers: ciphers,
      honorCipherOrder: !!ssl.honorCipherOrder,
      //
      // Protect against the POODLE attack by disabling SSLv3
      // @see http://googleonlinesecurity.blogspot.nl/2014/10/this-poodle-bites-exploiting-ssl-30.html
      //
      secureProtocol: 'SSLv23_method',
      secureOptions: require('constants').SSL_OP_NO_SSLv3
    });

    log('https | listening on %d', port);
    server = https.createServer(finalHttpsOptions, ssl.handler || handler);

    args = [server, port];
    if (options.https.host) {
      args.push(options.https.host);
    }

    args.push(function listener(err) { onListen('https', err, this); });
    connected.apply(null, args);
  }

  [createHttp, createHttps]
    .forEach(function (fn) { fn(); });
};

/**
 * function normalizeCertFile(root, file)
 * Returns the contents of `file` verbatim if it is determined to be
 * certificate material and not a file path. Otherwise, returns the
 * certificate material read from that file path.
 */
function normalizeCertFile(root, file) {
  //
  // Assumption that this is a Buffer, a PEM file, or something broken
  //
  if (typeof(file) !== 'string' || pemFormat.test(file)) {
    return file;
  }

  return fs.readFileSync(path.resolve(root, file));
}
