create-servers
==============

Create an http AND/OR an https server and call the same request handler.

**http**
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

**https**
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

**http && https**
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

**http && http (different handlers)s**
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

### Author: [Charlie Robbins](https://github.com/indexzero)
### License: MIT