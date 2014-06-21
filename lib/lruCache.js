var conf = require('./config')
  , log4js = require('log4js')
  , log = log4js.getLogger()
  , redis = require('./redis')

var LRUCache = function (driver) {
    var myConf = conf.cache[driver]
      , self = this;
    this.driverType = driver;
    this.driver = require('./cacheDrivers/' + myConf.driver);
    this.bounds = {
        low: eval(myConf.size) * myConf.bounds.low
      , high: eval(myConf.size) * myConf.bounds.high
    };

    log.debug('cache initilized, bounds: ' + this.bounds.low + ', ' + this.bounds.high);

    // Redis related data structures
    this.gcStarted = false;
    this.prefix = redis.conf.prefix + ':LRUCache:' + this.driverType + ':';
    this.redisKeys = {};
    ['size', 'itemList', 'itemCountInList', 'itemSize'].forEach(function (key) {
        self.redisKeys[key] = self.prefix + key;
    });
    this.gc();
    // this.size = 0
    // this.itemList = []
    // this.itemCountInList = {}
    // this.itemSize = {}
}

LRUCache.prototype.get = function (key, callback) {
    return this.driver.get(key, callback)
}

LRUCache.prototype.set = function (key, item) {
    return this.driver.set(key, item)
}

LRUCache.prototype.refresh = function (key, bytes) {
    var self = this;

    if (bytes != 0)
        log.debug('refreshing keys: ' + key);
    redis.hget(self.redisKeys.itemCountInList, key, function (err, itemCountInList) {
        var multiRedis = redis.multi();
        if (itemCountInList === null) {
            multiRedis.incrby(self.redisKeys.size, bytes)
        }
        multiRedis.hincrby(self.redisKeys.itemCountInList, key, 1)
        multiRedis.lpush(self.redisKeys.itemList, key)
        multiRedis.hset(self.redisKeys.itemSize, key, bytes)
        multiRedis.exec();
    });
    
    redis.get(self.redisKeys.size, function (err, size) {
        if (size > self.bounds.high) {
            self.gc()
        }
    })
}

/*
LRUCache.prototype.gc = function () {
    log.debug('start gc')
    do {
        var oldestItem = this.itemList.pop();
        if (this.itemCountInList[oldestItem] == 1) {
            log.debug('removed: ' + oldestItem)
            this.driver.del(oldestItem)
            this.size -= this.itemSize[oldestItem]

            this.itemCountInList[oldestItem] = null
            this.itemSize[oldestItem] = null
        } else {
            this.itemCountInList[oldestItem] --
        }
    } while (this.size > this.bounds.low)
    log.debug('gc done, now size: ' + this.size)
};
*/

LRUCache.prototype.gc = function () {
    var self = this
    var gc = function () {
        redis.rpop(self.redisKeys.itemList, function (err, oldestItem) {
            if (oldestItem != null) {
                redis.hget(self.redisKeys.itemCountInList, oldestItem, function (err, itemCount) {
                    redis.hget(self.redisKeys.itemSize, oldestItem, function (err, itemSize) {
                        var multiRedis = redis.multi();

                        if (itemCount == 1) {
                            log.debug('removed: ' + oldestItem)
                            self.driver.del(oldestItem)
                            multiRedis.decrby(self.redisKeys.size, itemSize)

                            multiRedis.hdel(self.redisKeys.itemCountInList, oldestItem)
                            multiRedis.hdel(self.redisKeys.itemSize, oldestItem)
                        } else {
                            multiRedis.hincrby(self.redisKeys.itemCountInList, oldestItem, -1)
                        }
                        multiRedis.exec();

                        gcAgain();
                    })
                })
            }
        })
    }
    var gcAgain = function () {
        redis.get(self.redisKeys.size, function (err, size) {
            if (size > self.bounds.low) {
                gc();
            } else {
                self.gcStarted = false;
                log.debug('gc done, now size: ' + size);
            }
        })
    }
    if (self.gcStarted) {
        return ;
    }
    self.gcStarted = true;
    log.debug('start gc')
    gcAgain();
};

exports.driver = function (driver) {
    return new LRUCache(driver);
}