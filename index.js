var log4js = require('log4js')
  , log = log4js.getLogger()
  , crypto = require('crypto')
  , http = require('http')
  , connect = require('connect')
  , request = require('request').defaults({
            encoding: null
          , proxy: 'http://localhost:3128'
          , forever: true
          , timeout: 5 * 1000 // 5 seconds
      })
  , proxy = connect()

var conf = require('./lib/config')
  , memLRUCache = require('./lib/lruCache').driver('memory')
  // , diskLRUCache = require('./lib/lruCache').driver('disk')

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
    next()
}

var memoryHit = function (req, res, next) {
    if (req.isCacheOff) {
        return next()
    }
    log.debug('inMemory check cache: ' + req.md5)
    memLRUCache.get(req.cacheKeyHeader, function (header) {
        if (header === null) {
            log.debug('MISS')
            next()
        } else {
            header = JSON.parse(header)
            memLRUCache.get(new Buffer(req.cacheKeyBody), function (body) {
                if (body === null) {
                    log.debug('MISS')
                    next()
                } else {
                    log.debug('HIT')
                    res.writeHead(header.statusCode, header.headers)
                    log.info('HIT TIME: ' + (new Date().valueOf() - req.startTime))
                    res.end(body)
                }
            });
        }
    });
}

var fetch = function (req, res, next) {
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
                log.info('statusCode error: ' + servRes.statusCode)
            }
        } else {
            log.error('an error:' + error)
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
http.createServer(proxy).listen(conf.proxy.port);