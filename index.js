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
module.exports = async function createServers(options, listening) {
  try {
    options = normalizeOptions(options);
  } catch (err) {
    return listening(err);
  }

  const [[httpErr, http], [httpsErr, https]] = await Promise.all([
    createHttp(options.http, options.log),
    createHttps(options.https, options.log)
  ]);

  const servers = {};
  if (http) servers.http = http;
  if (https) servers.https = https;

  if (httpErr || httpsErr) {
    let errorSource = httpsErr || httpErr;
    if (Array.isArray(errorSource)) {
      errorSource = errorSource[0];
    }
    return listening(
      errs.create({
        message: errorSource && errorSource.message,
        https: httpsErr,
        http: httpErr
      }),
      servers
    );
  }

  listening(undefined, servers);
};

function normalizeOptions(options) {
  const http = normalizeHttpOptions(options.http, options);
  const https = normalizeHttpsOptions(options.https, options);

  if (!http && !https) {
    throw new Error('http and/or https are required options');
  }

  return {
    http,
    https,
    log: options.log || function() {}
  };
}

function normalizeHttpOptions(httpConfig, baseConfig) {
  if (typeof httpConfig === 'undefined') return;

  if (Array.isArray(httpConfig)) {
    return httpConfig.map(cfg => normalizeHttpOptions(cfg, baseConfig));
  }

  let port =
    typeof httpConfig === 'object' && 'port' in httpConfig
      ? httpConfig.port
      : httpConfig;
  if (typeof port === 'undefined') {
    port = 80;
  }

  const http = {
    host: httpConfig.host || baseConfig.host,
    port: +port,
    handler: httpConfig.handler || baseConfig.handler,
    timeout: httpConfig.timeout || baseConfig.timeout
  };

  if (!http.handler) {
    throw new Error('handler option is required');
  }

  return http;
}

function normalizeHttpsOptions(httpsConfig, baseConfig) {
  if (typeof httpsConfig === 'undefined') return;

  if (Array.isArray(httpsConfig)) {
    return httpsConfig.map(cfg => normalizeHttpsOptions(cfg, baseConfig));
  }

  const https = {
    ...httpsConfig,
    host: httpsConfig.host || baseConfig.host,
    port: +('port' in httpsConfig ? httpsConfig.port : 443),
    handler: httpsConfig.handler || baseConfig.handler,
    timeout: httpsConfig.timeout || baseConfig.timeout
  };

  if (!https.handler) {
    throw new Error('handler option is required');
  }

  return https;
}

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
    ? data.map(function(item) {
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
  if (Array.isArray(file))
    return file.map(function map(item) {
      return normalizePEMContent(root, item);
    });

  //
  // Assumption that this is a Buffer, a PEM file, or something broken
  //
  if (typeof file !== 'string' || pemFormat.test(file)) {
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
  var hostRegexps = sniHosts.map(function(host) {
    return host === '*' ? /.*/ : new RegExp(
      '^' +
      host
        .replace('.', '\\.') // Match dots, not wildcards
        .replace('*\\.', '(?:.*\\.)?') + // Handle optional wildcard sub-domains
        '$',
      'i'
    );
  });

  // Prepare secure contexts ahead-of-time
  var hostSecureContexts = sniHosts.map(function(host) {
    var hostOpts = sslOpts.sni[host];

    var root = hostOpts.root || sslOpts.root;

    return tls.createSecureContext(
      assign({}, sslOpts, hostOpts, {
        key: normalizePEMContent(root, hostOpts.key),
        cert: normalizeCertContent(root, hostOpts.cert),
        ca: normalizeCA(root, hostOpts.ca || sslOpts.ca),
        ciphers: normalizeCiphers(hostOpts.ciphers || sslOpts.ciphers),
        honorCipherOrder: !!(
          hostOpts.honorCipherOrder || sslOpts.honorCipherOrder
        ),
        secureProtocol: 'SSLv23_method',
        secureOptions: secureOptions
      })
    );
  });

  return function(hostname, cb) {
    var matchingHostIdx = sniHosts.findIndex(function(candidate, i) {
      return hostRegexps[i].test(hostname);
    });

    if (matchingHostIdx === -1) {
      return void cb(new Error('Unrecognized hostname: ' + hostname));
    }

    cb(null, hostSecureContexts[matchingHostIdx]);
  };
}

//
// ### function createHttp (httpConfig)
// Attempts to create and listen on the the HTTP server.
//
async function createHttp(httpConfig, log) {
  if (typeof httpConfig === 'undefined') {
    log('http | no options.http; no server');
    return [null, null];
  }

  if (Array.isArray(httpConfig)) {
    return await createMultiple(createHttp, httpConfig, log);
  }

  return await new Promise(resolve => {
    var server = http.createServer(httpConfig.handler),
      timeout = httpConfig.timeout,
      port = httpConfig.port,
      args;

    if (typeof timeout === 'number') server.setTimeout(timeout);

    args = [server, port];
    if (httpConfig.host) {
      args.push(httpConfig.host);
    }

    log('http | try listen ' + port);
    args.push(function listener(err) {
      resolve([err, server]);
    });
    connected.apply(null, args);
  });
}

//
// ### function createHttps ()
// Attempts to create and listen on the HTTPS server.
//
async function createHttps(ssl, log) {
  if (typeof ssl === 'undefined') {
    log('https | no options.https; no server');
    return [null, null];
  }

  if (Array.isArray(ssl)) {
    return await createMultiple(createHttps, ssl, log);
  }

  return await new Promise(resolve => {
    var port = ssl.port,
      timeout = ssl.timeout,
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
      finalHttpsOptions.SNICallback = getSNIHandler(ssl);
    }

    log('https | listening on %d', port);
    server = https.createServer(finalHttpsOptions, ssl.handler);

    if (typeof timeout === 'number') server.setTimeout(timeout);
    args = [server, port];
    if (ssl.host) {
      args.push(ssl.host);
    }

    args.push(function listener(err) {
      resolve([err, server]);
    });
    connected.apply(null, args);
  });
}

async function createMultiple(createFn, configArray, log) {
  const errorsOrServers = await Promise.all(
    configArray.map(cfg => createFn(cfg, log))
  );
  const errors = [],
    servers = [];
  for (const [error, server] of errorsOrServers) {
    error && errors.push(error);
    server && servers.push(server);
  }
  return [errors.length ? errors : null, servers];
}
