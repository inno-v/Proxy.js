var log4js = require('log4js')
  , log = log4js.getLogger()
  , crypto = require('crypto')
  , http = require('http')
  , connect = require('connect')
  , request = require('request')
  , proxy = connect()

var conf = require('./lib/config')
  , memLRUCache = require('./lib/lruCache').driver('memory')
  // , diskLRUCache = require('./lib/lruCache').driver('disk')

var md5 = function (str) {
    return crypto.createHash('md5').update(str).digest('hex')
}

var initialPass = function (req, res, next) {
    log.info('client: ' + req.url)
    req.md5 = md5(req.url)
    req.cacheKeyHeader = req.md5 + ':h'
    req.cacheKeyBody = req.md5 + ':b'
    req.isCacheOff = req.headers['cache-control'] == 'no-cache'
    next()
}

var memoryHit = function (req, res, next) {
    if (req.isCacheOff) {
        return next()
    }
    log.info('inMemory check cache: ' + req.md5)
    memLRUCache.get(req.cacheKeyHeader, function (header) {
        if (header === null) {
            log.info('MISS')
            next()
        } else {
            header = JSON.parse(header)
            memLRUCache.get(req.cacheKeyBody, function (body) {
                if (body === null) {
                    log.info('MISS')
                    next()
                } else {
                    log.info('HIT')
                    res.writeHead(header.statusCode, header.headers)
                    res.end(body)
                }
            });
        }
    });
}

var fetch = function (req, res, next) {
    log.info('fetch : ' + req.url);
    req.headers.connection = 'keep-alive'
    var srvReq = request({
        uri: req.url
      , encoding: null
      , headers: req.headers
      , forever: true
    }, function(error, servRes, body) {
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
            }
        } else {
            res.end('')
        }
    })
}

var memoryCache = function (req, res, next) {
    if (req.isCacheOff) {
        return next()
    }
    memLRUCache.set(req.cacheKeyHeader, JSON.stringify(res.headerCache))
    memLRUCache.set(req.cacheKeyBody, res.body)
    next()
}

var refreshLRU = function (req, res, next) {
    if (req.isCacheOff) {
        return next()
    }
    memLRUCache.refresh(req.cacheKeyHeader, 0)
    memLRUCache.refresh(req.cacheKeyBody, res.body.length)
    next()
}

proxy.use(initialPass)
    .use(memoryHit)
    .use(fetch)
    .use(memoryCache)
    .use(refreshLRU)
http.createServer(proxy).listen(7789);