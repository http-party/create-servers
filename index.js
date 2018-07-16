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
    tls = require('tls'),
    path = require('path'),
    constants = require('constants'),
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

var secureOptions = constants.SSL_OP_NO_SSLv3;

/**
 * function createServers (dispatch, options, callback)
 * Creates and listens on both HTTP and HTTPS servers.
 */
module.exports = function createServers(options, listening) {
  if (!options
      || (typeof options.http === 'undefined' && typeof options.https === 'undefined')
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
    if (typeof options.http === 'undefined') {
      log('http | no options.http; no server');
      return onListen('http');
    }

    if (typeof options.http !== 'object') {
      options.http = {
        port: options.http
      };
    }

    var server = http.createServer(options.http.handler || handler),
        timeout = options.timeout || options.http.timeout,
        port   = !isNaN(options.http.port) ? +options.http.port : 80, // accepts string or number
        args;

    if (typeof timeout === 'number') server.setTimeout(timeout);

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
  function createHttps() {
    if (typeof options.https === 'undefined') {
      log('https | no options.https; no server');
      return onListen('https');
    }

    var ssl  = options.https,
        port = !isNaN(ssl.port) ? +ssl.port : 443,  // accepts string or number
        timeout = options.timeout || ssl.timeout,
        server,
        args;

    var finalHttpsOptions = assign({}, ssl, {
      //
      // Load default SSL key, cert and ca(s).
      //
      key: normalizePEMContent(ssl.root, ssl.key),
      cert: normalizeCertContent(ssl.root, ssl.cert, ssl.key),
      ca: normalizeCA(ssl.root, ssl.ca),
      //
      // Properly expose ciphers for an A+ SSL rating:
      // https://certsimple.com/blog/a-plus-node-js-ssl
      //
      ciphers: normalizeCiphers(ssl.ciphers),
      honorCipherOrder: !!ssl.honorCipherOrder,
      //
      // Protect against the POODLE attack by disabling SSLv3
      // @see http://googleonlinesecurity.blogspot.nl/2014/10/this-poodle-bites-exploiting-ssl-30.html
      //
      secureProtocol: 'SSLv23_method',
      secureOptions: secureOptions
    });

    if (ssl.sni && !finalHttpsOptions.SNICallback) {
      finalHttpsOptions.SNICallback = getSNIHandler(ssl)
    }

    log('https | listening on %d', port);
    server = https.createServer(finalHttpsOptions, ssl.handler || handler);

    if (typeof timeout === 'number') server.setTimeout(timeout);
    args = [server, port];
    if (ssl.host) {
      args.push(ssl.host);
    }

    args.push(function listener(err) { onListen('https', err, this); });
    connected.apply(null, args);
  }

  [createHttp, createHttps]
    .forEach(function (fn) { fn(); });
};

function normalizeCertContent(root, cert, key) {
  // Node accepts an array of certs, which must match up with an array of keys.
  // The user may instead intend for an array passed into cert to represent
  // a cert chain they want to concatenate. Therefore, if key is not an array,
  // we'll assume the latter.
  if (Array.isArray(cert)) {
    if (Array.isArray(key)) {
      // This is an array of certs/chains with corresponding keys
      return normalizeCertChainList(root, cert);
    } else {
      // This is a single cert chain
      return normalizeCertChain(root, cert);
    }
  }

  return normalizePEMContent(root, cert);
}

function normalizeCertChainList(root, data) {
  // If this is an array, treat like an array of bundles, otherwise a single
  // bundle
  return Array.isArray(data)
    ? data.map(function (item) {
      return normalizeCertChain(root, item);
    })
    : normalizePEMContent(root, data);
}

function normalizeCertChain(root, data) {
  // A chain can be an array, which we concatenate together into one PEM,
  // an already-concatenated chain, or a single PEM

  const content = normalizePEMContent(root, data);
  return Array.isArray(content) ? content.join('\n') : content;
}

function normalizeCA(root, ca) {
  if (ca && !Array.isArray(ca)) {
    ca = [ca];
  }
  return ca && ca.map(normalizePEMContent.bind(null, root));
}

/**
 * function normalizePEMContent(root, file)
 * Returns the contents of `file` verbatim if it is determined to be
 * certificate material and not a file path. Otherwise, returns the
 * certificate material read from that file path.
 */
function normalizePEMContent(root, file) {
  if (Array.isArray(file)) return file.map(function map(item) {
    return normalizePEMContent(root, item)
  });

  //
  // Assumption that this is a Buffer, a PEM file, or something broken
  //
  if (typeof(file) !== 'string' || pemFormat.test(file)) {
    return file;
  }

  return fs.readFileSync(path.resolve(root, file));
}

function normalizeCiphers(ciphers) {
  ciphers = ciphers || CIPHERS;
  //
  // Remark: If an array is passed in lets join it like we do the defaults
  //
  if (Array.isArray(ciphers)) {
    ciphers = ciphers.join(':');
  }
  return ciphers;
}

function getSNIHandler(sslOpts) {
  var sniHosts = Object.keys(sslOpts.sni);

  // Pre-compile regexps for the hostname
  var hostRegexps = sniHosts.map(function (host) {
    return new RegExp(
      '^' +
      host
        .replace('.', '\\.')             // Match dots, not wildcards
        .replace('*\\.', '(?:.*\\.)?') + // Handle optional wildcard sub-domains
      '$',
      'i'
    );
  });

  // Prepare secure context params ahead-of-time
  var hostTlsOpts = sniHosts.map(function (host) {
    var hostOpts = sslOpts.sni[host];

    var root = hostOpts.root || sslOpts.root;

    return assign({}, sslOpts, hostOpts, {
      key: normalizePEMContent(root, hostOpts.key),
      cert: normalizeCertContent(root, hostOpts.cert),
      ca: normalizeCA(root, hostOpts.ca || sslOpts.ca),
      ciphers: normalizeCiphers(hostOpts.ciphers || sslOpts.ciphers),
      honorCipherOrder: !!(hostOpts.honorCipherOrder || sslOpts.honorCipherOrder),
      secureProtocol: 'SSLv23_method',
      secureOptions: secureOptions
    });
  });

  return function (hostname, cb) {
    var matchingHostIdx = sniHosts.findIndex(function(candidate, i) {
      return hostRegexps[i].test(hostname);
    });

    if (matchingHostIdx === -1) {
      return void cb(new Error('Unrecognized hostname: ' + hostname));
    }

    cb(null, tls.createSecureContext(hostTlsOpts[matchingHostIdx]));
  };
}
