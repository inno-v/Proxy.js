var conf = require('./lib/config')
  , memLRUCache = require('./lib/lruCache').driver('memory')
  , diskLRUCache = require('./lib/lruCache').driver('disk');

var log4js = require('log4js')
  , log = log4js.getLogger()
  , crypto = require('crypto')
  , http = require('http')
  , connect = require('connect')
  , request = require('request').defaults({
            encoding: null
          , proxy: 'http://localhost:3128'
          , forever: conf.proxy.http.reuseConnection
          , timeout: eval(conf.proxy.http.timeout)
      })
  , proxy = connect();

var md5 = function (str) {
    return crypto.createHash('md5').update(str).digest('hex')
}

var initialPass = function (req, res, next) {
    log.info('client: ' + req.url)
    req.startTime = new Date().valueOf();
    req.md5 = md5(req.url)
    req.cacheKeyHeader = req.md5 + ':h'
    req.cacheKeyBody = req.md5 + ':b'
    req.isCacheOff = req.headers['cache-control'] == 'no-cache'
    req.hit = false;
    next()
}

var hitCheck = function (type) { // memory or disk
    return function (req, res, next) {
        if (req.isCacheOff || req.hit) {
            return next()
        }

        var lruCache = type == 'memory' ? memLRUCache : diskLRUCache;
        log.debug(type + ' check cache: ' + req.md5)
        lruCache.get(req.cacheKeyHeader, function (header) {
            if (header === null) {
                log.debug(type + ' MISS')
                next()
            } else {
                header = JSON.parse(header)
                lruCache.get(new Buffer(req.cacheKeyBody), function (body) {
                    if (body === null) {
                        log.debug(type + ' MISS')
                    } else {
                        log.debug(type + ' HIT');
                        res.writeHead(header.statusCode, header.headers);
                        log.info(type + ' HIT TIME: ' + (new Date().valueOf() - req.startTime));
                        res.end(body);

                        // we need to save cache into another device
                        res.headerCache = header;
                        res.body = body;
                        req.hit = type;
                    }
                    next();
                });
            }
        });
    };
}

var fetch = function (req, res, next) {
    if (req.hit) {
        return next();
    }

    log.info('fetch : ' + req.url);
    req.headers.connection = 'keep-alive'
    var srvReq = request({uri: req.url, headers: req.headers}, function(error, servRes, body) {
        log.info('MISS TIME: ' + (new Date().valueOf() - req.startTime))
        if (!error) {
            res.writeHead(servRes.statusCode, servRes.headers)
            res.end(body)
            if (servRes.statusCode == 200) {
                res.headerCache = {
                    statusCode: servRes.statusCode,
                    headers: servRes.headers
                }
                res.body = body;
                next()
            } else {
                // TODO: fail cache
                log.info('statusCode error: ' + servRes.statusCode)
            }
        } else {
            // TODO: fail cache
            log.error('an error:' + error)
            res.end('')
        }
    })
}

var saveCache = function (type) {
    return function (req, res, next) {
        if (req.isCacheOff || req.hit == type) {
            return next()
        }

        var lruCache = type == 'memory' ? memLRUCache : diskLRUCache;
        lruCache.set(req.cacheKeyHeader, JSON.stringify(res.headerCache))
        lruCache.set(req.cacheKeyBody, res.body)

        lruCache.refresh(req.cacheKeyHeader, 0)
        lruCache.refresh(req.cacheKeyBody, res.body.length)
        next()
    };
};

var memoryCache = 

proxy.use(initialPass)
    .use(hitCheck('memory'))
    .use(hitCheck('disk'))
    .use(fetch)
    .use(saveCache('disk'))
    .use(saveCache('memory'))
http.createServer(proxy).listen(conf.proxy.port);