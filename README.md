# create-servers

Create an http AND/OR an https server and call the same request handler.

## Usage

The `create-servers` module exports a function that takes a config object and
a node-style callback. The config object must have at minimum an `http` or 
`https` property (or both). The following config properties are supported:

| Property                  | Description |
|---------------------------|-------------|
| `handler`                 | Request handler to be used for any server, unless overridden specifically with `http.handler` or `https.handler`. |
| `timeout`                 | Socket timeout in milliseconds for any server, unless overridden with `http.timeout` or `https.timeout`. Defaults to the node default of 2 minutes. | 
| `http`                    | Optional. If present, an HTTP server is started. This can be an object or a number. If it's a number, it's used as the TCP port for an HTTP server. |
| `http.port`               | TCP port for the HTTP server. Defaults to `80`. |
| `http.host`               | The address the HTTP server is bound to. Defaults to `::` or `0.0.0.0`. |
| `http.timeout`            | Socket timeout in milliseconds for the server. If unspecified, the top-level `timeout` configuration is used. |
| `http.handler`            | Handler for HTTP requests. If you want to share a handler with all servers, use a top-level `handler` config property instead. |
| `https`                   | Optional object. If present, an HTTPS server is started. |
| `https.port`              | TCP port for the HTTPS server. Defaults to `443`. |
| `https.host`              | The address the HTTPS server is bound to. Defaults to `::` or `0.0.0.0`. |
| `https.timeout`           | Socket timeout in milliseconds for the server. If unspecified, the top-level `timeout` configuration is used. |
| `https.ciphers`           | Defaults to a [default cipher suite](#note-on-security). To customize, either supply a colon-separated string or array of strings for the ciphers you want the server to support. |
| `https.honorCipherOrder`  | If true, prefer the server's specified cipher order instead of the client's. Defaults to `false`. |
| `https.root`              | Root directory for certificate/key files. See [Certificate normalization](#certificate-normalization) for more details. |
| `https.key`               | PEM/file path for the server's private key. See [Certificate normalization](#certificate-normalization) for more details. |
| `https.cert`              | PEM/file path(s) for the server's certificate. See [Certificate normalization](#certificate-normalization) for more details. |
| `https.ca`                | Cert or array of certs specifying trusted authorities for peer certificates. Only required if your server accepts client certificate connections signed by authorities that are not trusted by default. See [Certificate normalization](#certificate-normalization) for more details. |
| `https.handler`           | Handler for HTTPS requests. If you want to share a handler with all servers, use a top-level `handler` config property instead. |
| `https.*`                 | Any other properties supported by [https.createServer](https://nodejs.org/dist/latest-v8.x/docs/api/https.html#https_https_createserver_options_requestlistener) can be added to the https object, except `secureProtocol` and `secureOptions` which are set to recommended values. |

If successful, the `create-servers` callback is passed an object with the
following properties:

| Property | Description |
|----------|-------------|
| `http`   | The HTTP server that was created, if any |
| `https`  | The HTTPS server that was created, if any |

### Certificate normalization

`create-servers` provides some conveniences for `https.ca`, `https.key`, and 
`https.cert` config properties. You may use PEM data directly (inside a `Buffer`
or string) or a file name. When using a file name, you may also set an 
`https.root` config property to enable using relative paths to cert/key files.
`https.ca` and `https.cert` also support specifying an Array of certs/files.

## NOTE on Security
Inspired by [`iojs`][iojs] and a well written [article][article], we have defaulted
our [ciphers][ciphers] to support "perfect-forward-security" as well as removing insecure
cipher suites from being a possible choice. With this in mind,
be aware that we will no longer support ie6 on windows XP by default. 

## Examples

### http
``` js
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
``` js
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
``` js
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
``` js
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
