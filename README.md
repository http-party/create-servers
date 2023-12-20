# create-servers

Create an http AND/OR an https server and call the same request handler.

## Usage

The `create-servers` module exports a function that takes a config object and
a node-style callback. The config object must have at minimum an `http` or
`https` property (or both). The following config properties are supported:

| Property                 | Description                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handler`                | Request handler to be used for any server, unless overridden specifically with `http.handler` or `https.handler`.                                                                                                                                                                     |
| `timeout`                | Socket timeout in milliseconds for any server, unless overridden with `http.timeout` or `https.timeout`. Defaults to the node default of 2 minutes.                                                                                                                                   |
| `keepAliveTimeout`       | Milliseconds of activity before sockets are destroyed. Defaults to the node default value (currently 5 seconds). |
| `http`                   | Optional. If present, an HTTP server is started. This can be an object or a number. If it's a number, it's used as the TCP port for an HTTP server. You may also use an Array to start multiple servers.                                                                              |
| `http.port`              | TCP port for the HTTP server. Defaults to `80`.                                                                                                                                                                                                                                       |
| `http.host`              | The address the HTTP server is bound to. Defaults to `::` or `0.0.0.0`.                                                                                                                                                                                                               |
| `http.timeout`           | Socket timeout in milliseconds for the server. If unspecified, the top-level `timeout` configuration is used.                                                                                                                                                                         |
| `http.keepAliveTimeout`  | Overrides the top-level keepAliveTimeout setting if specified. |
| `http.handler`           | Handler for HTTP requests. If you want to share a handler with all servers, use a top-level `handler` config property instead.                                                                                                                                                        |
| `https`                  | Optional object. If present, an HTTPS server is started. You may start multiple HTTPS servers by passing an array of objects                                                                                                                                                          |
| `https.port`             | TCP port for the HTTPS server. Defaults to `443`.                                                                                                                                                                                                                                     |
| `https.host`             | The address the HTTPS server is bound to. Defaults to `::` or `0.0.0.0`.                                                                                                                                                                                                              |
| `https.timeout`          | Socket timeout in milliseconds for the server. If unspecified, the top-level `timeout` configuration is used.                                                                                                                                                                         |
| `https.keepAliveTimeout`  | Overrides the top-level keepAliveTimeout setting if specified. |
| `https.ciphers`          | Defaults to a [default cipher suite](#note-on-security). To customize, either supply a colon-separated string or array of strings for the ciphers you want the server to support.                                                                                                     |
| `https.honorCipherOrder` | If true, prefer the server's specified cipher order instead of the client's. Defaults to `false`.                                                                                                                                                                                     |
| `https.root`             | Root directory for certificate/key files. See [Certificate normalization](#certificate-normalization) for more details.                                                                                                                                                               |
| `https.key`              | PEM/file path for the server's private key. See [Certificate normalization](#certificate-normalization) for more details.                                                                                                                                                             |
| `https.cert`             | PEM/file path(s) for the server's certificate. See [Certificate normalization](#certificate-normalization) for more details.                                                                                                                                                          |
| `https.ca`               | Cert or array of certs specifying trusted authorities for peer certificates. Only required if your server accepts client certificate connections signed by authorities that are not trusted by default. See [Certificate normalization](#certificate-normalization) for more details. |
| `https.sni`              | See [SNI Support](#sni-support).                                                                                                                                                                                                                                                      |
| `https.handler`          | Handler for HTTPS requests. If you want to share a handler with all servers, use a top-level `handler` config property instead.                                                                                                                                                       |
| `https.*`                | Any other properties supported by [https.createServer](https://nodejs.org/dist/latest-v8.x/docs/api/https.html#https_https_createserver_options_requestlistener) can be added to the https object, except `secureProtocol` and `secureOptions` which are set to recommended values.   |
| `http2`                  | Optional object. If present, an HTTP/2 server is started. You may start multiple HTTP/2 servers by passing an array of objects                                                                                                                                                        |
| `http2.allowHTTP1`       | Enable [ALPN negotiation] allowing support for both HTTPS and HTTP/2 on the same socket.                                                                                                                                                                                              |
| `http2.*`                | The same `https` security options are allowed, as well as any other properties supported by [http2.createSecureServer](https://nodejs.org/dist/latest-v8.x/docs/api/http2.html#http2_http2_createsecureserver_options_onrequesthandler).                                              |

If successful, the `create-servers` callback is passed an object with the
following properties:

| Property | Description                                                                                     |
| -------- | ----------------------------------------------------------------------------------------------- |
| `http`   | The HTTP server that was created, if any. If creating multiple servers, this will be an Array.  |
| `https`  | The HTTPS server that was created, if any. If creating multiple servers, this will be an Array. |

### Certificate Normalization

`create-servers` provides some conveniences for `https.ca`, `https.key`, and
`https.cert` config properties. You may use PEM data directly (inside a `Buffer`
or string) or a file name. When using a file name, you must also set an
`https.root` config property if using relative paths to cert/key files.

`https.ca`, `https.cert`, and `https.key` also support specifying an Array.
Given an array for `cert`, you must have a matching array for `key` so each cert
can be matched with its private key.

```js
const createServers = require('create-servers');

createServers({
  https: {
    root: '/cert/path',
    cert: ['cert1.crt', 'cert2.crt'],
    key: ['cert1.key', 'cert2.key']
  }
}, err => {
  // ...
})
```

If you have a cert that is signed by an intermediate CA, your server will need
to append the untrusted parts of the CA chain with your cert. To make this more
convenient, `create-servers` lets you use an array to automatically create a
chain.

```js
const createServers = require('create-servers');

createServers({
  https: {
    root: '/cert/path',
    cert: ['cert.crt', 'intermediate.crt'],
    key: 'cert.key'
  }
}, err => {
  // ...
})
```

If you are specifying multiple certs _and_ you want to create chains for each,
use an array of arrays.

```js
const createServers = require('create-servers');

createServers({
  https: {
    root: '/cert/path',
    cert: [['cert1.crt', 'intermediate.crt'], 'cert2.crt'],
    key: ['cert1.key', 'cert2.key']
  }
}, err => {
  // ...
})
```

### SNI Support

[Server Name Indication](https://en.wikipedia.org/wiki/Server_Name_Indication),
or SNI, lets HTTPS clients announce which hostname they wish to connect to
before the server sends its certificate, enabling the use of the same server for
multiple hosts. Although `SNICallback` can be used to support this, you lose the
convenient certificate normalization provided by `create-servers`. The `sni`
config option provides an easier way.

The `sni` option is an object with each key being a supported hostname and each
value being a subset of the HTTPS settings listed above. HTTPS settings defined
at the top level are used as defaults for the hostname-specific settings.

```js
const createServers = require('create-servers');

createServers(
  {
    https: {
      port: 443,
      sni: {
        'example1.com': {
          key: '/certs/private/example1.com.key',
          cert: '/certs/public/example1.com.crt'
        },
        'example2.com': {
          key: '/certs/private/example2.com.key',
          cert: '/certs/public/example2.com.crt'
        }
      }
    },
    handler: function (req, res) {
      res.end('Hello');
    }
  },
  function (errs) {
    if (errs) {
      return console.log(errs.https);
    }

    console.log('Listening on 443');
  }
);
```

Use `*` in the hostname for wildcard certs. Example: `*.example.com`. The
following settings are supported in the host-specific configuration:

* key
* cert
* ca
* ciphers
* honorCipherOrder
* Anything else supported by [`tls.createSecureContext`](https://nodejs.org/dist/latest-v8.x/docs/api/tls.html#tls_tls_createsecurecontext_options)

## NOTE on Security
Inspired by [`iojs`][iojs] and a well written [article][article], we have defaulted
our [ciphers][ciphers] to support "perfect-forward-security" as well as removing insecure
cipher suites from being a possible choice. With this in mind,
be aware that we will no longer support ie6 on windows XP by default.

## Examples

### http

```js
var createServers = require('create-servers');

var servers = createServers(
  {
    http: 80,
    handler: function (req, res) {
      res.end('http only');
    }
  },
  function (errs) {
    if (errs) {
      return console.log(errs.http);
    }

    console.log('Listening on 80');
  }
);
```

### https

```js
var servers = createServers(
  {
    https: {
      port: 443,
      root: '/path/to/ssl/files',
      key: 'your-key.pem',
      cert: 'your-cert.pem',
      ca: 'your-ca.pem' // Can be an Array of CAs
    },
    handler: function (req, res) {
      res.end('https only');
    }
  },
  function (errs) {
    if (errs) {
      return console.log(errs.https);
    }

    console.log('Listening on 443');
  }
);
```

### http && https

```js
var servers = createServers(
  {
    http: 80,
    https: {
      port: 443,
      root: '/path/to/ssl/files',
      key: 'your-key.pem',
      cert: 'your-cert.pem',
      ca: 'your-ca.pem' // Can be an Array of CAs
    },
    handler: function (req, res) {
      res.end('http AND https');
    }
  },
  function (errs, servers) {
    if (errs) {
      return Object.keys(errs).forEach(function (key) {
        console.log('Error ' + key + ': ' + errs[key]);
        if (servers[key]) {
          servers[key].close();
        }
      });
    }

    console.log('Listening on 80 and 443');
  }
);
```

### http && https (different handlers)

```js
var servers = createServers(
  {
    http: {
      port: 80,
      handler: function (req, res) {
        res.end('http');
      }
    },
    https: {
      port: 443,
      root: '/path/to/ssl/files',
      key: 'your-key.pem',
      cert: 'your-cert.pem',
      ca: 'your-ca.pem', // Can be an Array of CAs
      handler: function (req, res) {
        res.end('https');
      }
    }
  },
  function (errs, servers) {
    if (errs) {
      return Object.keys(errs).forEach(function (key) {
        console.log('Error ' + key + ': ' + errs[key]);
        if (servers[key]) {
          servers[key].close();
        }
      });
    }

    console.log('Listening on 80 and 443');
  }
);
```

## Author: [Charlie Robbins](https://github.com/indexzero)
## License: MIT

[article]: https://certsimple.com/blog/a-plus-node-js-ssl
[iojs]: https://github.com/iojs/io.js
[ciphers]: https://iojs.org/api/tls.html#tls_tls_createserver_options_secureconnectionlistener
[ALPN negotiation]: https://nodejs.org/api/http2.html#http2_alpn_negotiation
