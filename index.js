'use strict';

/*
 * index.js: Create an http AND/OR an https server and call the same request handler.
 *
 * (C) 2013, Charlie Robbins.
 *
 */

const
  fs = require('fs').promises,
  tls = require('tls'),
  path = require('path'),
  constants = require('constants'),
  connected = require('connected'),
  errs = require('errs'),
  assign = require('object-assign');

const pemFormat = /-----BEGIN/;

const CIPHERS = [
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

const secureOptions = constants.SSL_OP_NO_SSLv3;

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

  const [httpResult, httpsResult, http2Result] = await Promise.allSettled([
    createHttp(options.http, options.log),
    createHttps(options.https, options.log),
    createHttps(options.http2, options.log, true)
  ])

  const servers = {};
  if (httpResult.value) servers.http = httpResult.value;
  if (httpsResult.value) servers.https = httpsResult.value;
  if (http2Result.value) servers.http2 = http2Result.value;

  const errorSource = httpResult.reason || httpsResult.reason || http2Result.reason;
  if (errorSource) {
    if (Array.isArray(errorSource)) {
      errorSource = errorSource[0];
    }
    return listening(
      errs.create({
        message: errorSource && errorSource.message,
        http2: http2Result.reason,
        https: httpsResult.reason,
        http: httpResult.reason
      }),
      servers
    );
  }

  listening(undefined, servers);
};

function normalizeOptions(options) {
  const http = normalizeHttpOptions(options.http, options);
  const https = normalizeHttpsOptions(options.https, options);
  const http2 = normalizeHttpsOptions(options.http2, options);

  if (!http && !https && !http2) {
    throw new Error('http, https, and/or http2 are required options');
  }

  return {
    http,
    https,
    http2,
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
    timeout: httpConfig.timeout || baseConfig.timeout,
    keepAliveTimeout: httpConfig.keepAliveTimeout || baseConfig.keepAliveTimeout
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
    timeout: httpsConfig.timeout || baseConfig.timeout,
    keepAliveTimeout: httpsConfig.keepAliveTimeout || baseConfig.keepAliveTimeout
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
    ? Promise.all(data.map(function(item) {
        return normalizeCertChain(root, item);
      }))
    : normalizePEMContent(root, data);
}

async function normalizeCertChain(root, data) {
  // A chain can be an array, which we concatenate together into one PEM,
  // an already-concatenated chain, or a single PEM

  const content = await normalizePEMContent(root, data);
  return Array.isArray(content) ? content.join('\n') : content;
}

function normalizeCA(root, ca) {
  if (ca && !Array.isArray(ca)) {
    ca = [ca];
  }
  return ca && Promise.all(ca.map(normalizePEMContent.bind(null, root)));
}

/**
 * function normalizePEMContent(root, file)
 * Returns the contents of `file` verbatim if it is determined to be
 * certificate material and not a file path. Otherwise, returns the
 * certificate material read from that file path.
 */
function normalizePEMContent(root, file) {
  if (Array.isArray(file))
    return Promise.all(file.map(function map(item) {
      return normalizePEMContent(root, item);
    }));

  //
  // Assumption that this is a Buffer, a PEM file, or something broken
  //
  if (typeof file !== 'string' || pemFormat.test(file)) {
    return file;
  }

  return fs.readFile(path.resolve(root, file));
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

async function getSNIHandler(sslOpts) {
  const sniHosts = Object.keys(sslOpts.sni);

  // Pre-compile regexps for the hostname
  const hostRegexps = sniHosts.map(function(host) {
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
  const hostSecureContexts = await Promise.all(sniHosts.map(async function(host) {
    var hostOpts = sslOpts.sni[host];

    var root = hostOpts.root || sslOpts.root;

    const [key, cert, ca] = await Promise.all([
      normalizePEMContent(root, hostOpts.key),
      normalizeCertContent(root, hostOpts.cert),
      normalizeCA(root, hostOpts.ca || sslOpts.ca)
    ])

    return tls.createSecureContext(
      assign({}, sslOpts, hostOpts, {
        key,
        cert,
        ca,
        ciphers: normalizeCiphers(hostOpts.ciphers || sslOpts.ciphers),
        honorCipherOrder: !!(
          hostOpts.honorCipherOrder || sslOpts.honorCipherOrder
        ),
        secureProtocol: 'SSLv23_method',
        secureOptions: secureOptions
      })
    );
  }));

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
    return null;
  }

  if (Array.isArray(httpConfig)) {
    return await createMultiple(createHttp, httpConfig, log);
  }

  const
    server = require('http').createServer(httpConfig.handler),
    port = httpConfig.port;

  commonPostCreateSetup(httpConfig, server);

  const args = [server, port];
  if (httpConfig.host) {
    args.push(httpConfig.host);
  }

  log('http | try listen ' + port);

  return new Promise((resolve, reject) => {
    args.push(function listener(err) {
      err ? reject(err) : resolve(server);
    });
    connected.apply(null, args);
  });
}

//
// ### function createHttps ()
// Attempts to create and listen on the HTTPS server.
//
async function createHttps(ssl, log, h2) {
  if (typeof ssl === 'undefined') {
    log('https | no options.https; no server');
    return null;
  }

  if (Array.isArray(ssl)) {
    return await createMultiple(createHttps, ssl, log, h2);
  }

  const [key, cert, ca] = await Promise.all([
    normalizePEMContent(ssl.root, ssl.key),
    normalizeCertContent(ssl.root, ssl.cert, ssl.key),
    normalizeCA(ssl.root, ssl.ca)
  ]);

  const finalHttpsOptions = assign({}, ssl, {
    key,
    cert,
    ca,
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
    finalHttpsOptions.SNICallback = await getSNIHandler(ssl);
  }

  const port = ssl.port;
  log('https | listening on %d', port);
  const server = h2
    ? require('http2').createSecureServer(finalHttpsOptions, ssl.handler)
    : require('https').createServer(finalHttpsOptions, ssl.handler);

  commonPostCreateSetup(ssl, server);
  const args = [server, port];
  if (ssl.host) {
    args.push(ssl.host);
  }

  return new Promise((resolve, reject) => {
    args.push(function listener(err) {
      err ? reject(err) : resolve(server);
    });
    connected.apply(null, args);
  });
}

async function createMultiple(createFn, configArray, log) {
  const errorsOrServers = await Promise.allSettled(
    configArray.map(cfg => createFn(cfg, log))
  );

  const errors = [], servers = [];
  for (const result of errorsOrServers) {
    result.reason && errors.push(result.reason);
    result.value && servers.push(result.value);
  }

  if (errors.length) {
    throw errors;
  } else {
    return servers;
  }
}

function commonPostCreateSetup({ timeout, keepAliveTimeout }, server) {
  if (typeof timeout === 'number') {
    server.setTimeout(timeout);
  }
  if (typeof keepAliveTimeout === 'number') {
    server.keepAliveTimeout = keepAliveTimeout;
  }
}
