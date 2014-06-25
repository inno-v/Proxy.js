# Proxy.js

This is a forward standalone caching proxy (like squid, traffic server, etc.) implemented using Node.js. It is designed to be a fast, highly-customizable proxy like Varnish. Varnish is awesome but it's a reverse proxy.

The cache elimination strategy is LRU, and the storage implementation itself is abstract, it means, rather than three drivers we provide(Memory, Redis, Disk), you can implement your own driver yourselves.

We choose Redis to store our LRU information, and to be one of our storage driver, it's extremely fast.

## Why?

In some of my project, I use crawler to get HTMLs and images from other website using PHP Curl. Each script executes in different process, so I need a forward proxy(with cache and connection pool) to reduce the pressure on these websites. Firstly, I chose Squid as forward proxy and found it hard to adjust the logic of Squid. Varnish is not suitable because it's a reverse proxy. Finally I decided to write it myself using Node.js.

## Work in Progress
This project is not ready for public use. It is still in development and currently just in the stage of development. Proxy.js doesn't follow HTTP proxy protocol and data in the proxy will not stale until it is eliminate from LRU.

## Design

We use connect to be the middleware. As shown in index.js, when request is coming, we'll check whether the cache is in memory or disk in order, finally update it's LRU table.
``` javascript
var main = function () {
    proxy.use(initialPass)
        .use(hitCheck('memory'))
        .use(hitCheck('disk'))
        .use(fetch)
        .use(saveCache('disk'))
        .use(saveCache('memory'));
    http.createServer(proxy).listen(conf.proxy.port);
};
```

## Installation

Proxy.js depends on [Redis](http://redis.io/), you'll need to [install Redis](http://redis.io/download) first.

And, of course, [Node.js](http://nodejs.org/download/)

## Configuration

All configuration and comments are defined in config.yaml.default.

## Usage

Highly recommended to use [Forever](https://github.com/nodejitsu/forever) to start Proxy.js.

``` sh
> npm install -g forever

> npm install
> cp config.yaml.default config.yaml
> vim config.yaml
> forever start index.js
```

## deploy

### FreeBSD
You can write an RC Script to deploy it on FreeBSD, please refer to [this article](http://sysmagazine.com/posts/137857/).
Note: you'll need to use newsyslog to perform log rotation.


## License

Licensed under the MIT license. Please refer to the LICENSE file for details.