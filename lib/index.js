var conf = require('./proxy.js/config')
  , memLRUCache = require('./proxy.js/lruCache').driver('memory')
  , diskLRUCache = require('./proxy.js/lruCache').driver('disk');

var log = require('log4js').getLogger()
  , crypto = require('crypto')
  , http = require('http')
  , request = require('request').defaults({
            encoding: null
          , forever: conf.proxy.http.reuseConnection
          , timeout: eval(conf.proxy.http.timeout)
      })
  , connect = require('connect')
  , proxy = connect();

var main = function () {
    proxy.use(initialPass)
        .use(hitCheck('memory'))
        .use(hitCheck('disk'))
        .use(fetch)
        .use(saveCache('disk'))
        .use(saveCache('memory'))
    http.createServer(proxy).listen(conf.proxy.port);
};

var md5 = function (str) {
    return crypto.createHash('md5').update(str).digest('hex')
};

var initialPass = function (req, res, next) {
    log.info('client: ' + req.url)
    req.hit = false;
    req.md5 = md5(req.url)
    req.startTime = new Date().valueOf();
    req.cacheKeyHeader = req.md5 + ':h'
    req.cacheKeyBody = req.md5 + ':b'
    req.isCacheOff = req.headers['cache-control'] == 'no-cache'
    if (req.isCacheOff) {
        log.info('cache: off');
    }
    next()
};

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
                try {
                    header = JSON.parse(header);
                    lruCache.get(new Buffer(req.cacheKeyBody), function (body) {
                        if (body === null) {
                            log.debug(type + ' MISS')
                        } else {
                            res.writeHead(header.statusCode, header.headers);
                            log.info(type + ' HIT TIME: ' + (new Date().valueOf() - req.startTime));
                            res.end(body);

                            // we need to save cache into another device
                            res.headerCache = header;
                            res.body = body;
                            req.hit = type;
                        }
                        // whether miss or hit, we should go to next module
                        // miss: fetch it
                        // hit: save into another device (mem -> disk / disk -> mem)
                        next();
                    });
                } catch (e) {
                    log.error(e);
                    next();
                }
            }
        });
    };
};

var fetch = function (req, res, next) {
    if (req.hit) {
        return next()
    }

    log.info('fetch : ' + req.url)
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
                res.body = body
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
};

var saveCache = function (type) {
    return function (req, res, next) {
        if (req.isCacheOff) {
            return next()
        }
        var lruCache = type == 'memory' ? memLRUCache : diskLRUCache;
        // if in the cache, then there's no need to cache
        if (req.hit != type) {
            lruCache.set(req.cacheKeyHeader, JSON.stringify(res.headerCache))
            lruCache.set(req.cacheKeyBody, res.body)
        }

        lruCache.refresh(req.cacheKeyHeader, 0)
        lruCache.refresh(req.cacheKeyBody, res.body.length)
        next()
    };
};

main();