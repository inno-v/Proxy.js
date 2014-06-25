var conf = require('./config')
  , log = require('log4js').getLogger()
  , redis = require('./redis')
  , noop = function () {};

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
    this.redisKeys = {};
    var prefix = redis.conf.prefix + ':LRUCache:' + this.driverType + ':';
    ['size', 'itemList', 'itemCountInList', 'itemSize'].forEach(function (key) {
        self.redisKeys[key] = prefix + key;
    });

    this.gc();
}

LRUCache.prototype.get = function (key, callback) {
    var self = this;
    redis.hget(self.redisKeys.itemCountInList, key, function (err, itemCountInList) {
        if (err || itemCountInList == null) {
            callback(null);
        } else {
            self.driver.get(key, callback);
        }
    });
}

LRUCache.prototype.set = function (key, item) {
    this.driver.set(key, item, noop);
}

// LRU refreshing keys
LRUCache.prototype.refresh = function (key, bytes) {
    var self = this;

    if (bytes != 0) {
        log.debug('refreshing keys: ' + key);
    }
    redis.hget(self.redisKeys.itemCountInList, key, function (err, itemCountInList) {
        var multiRedis = redis.multi();
        if (itemCountInList === null) {
            multiRedis.incrby(self.redisKeys.size, bytes);
            multiRedis.hset(self.redisKeys.itemSize, key, bytes);
        }
        multiRedis.hincrby(self.redisKeys.itemCountInList, key, 1);
        multiRedis.lpush(self.redisKeys.itemList, key);
        multiRedis.exec();
    });
    
    redis.get(self.redisKeys.size, function (err, size) {
        if (size > self.bounds.high) {
            self.gc()
        }
    })
}

LRUCache.prototype.gc = function () {
    var self = this
      , gc = function () {
            redis.rpop(self.redisKeys.itemList, function (err, oldestItem) {
                if (oldestItem != null) {
                    redis.multi()
                        .hget(self.redisKeys.itemCountInList, oldestItem)
                        .hget(self.redisKeys.itemSize, oldestItem)
                        .exec(function (err, replies) {
                            if (err)
                                return ;
                            var itemCount = replies[0]
                              , itemSize = replies[1]
                              , multiRedis = redis.multi();

                            if (itemCount == 1) {
                                log.debug('removed: ' + oldestItem);
                                self.driver.del(oldestItem, failCallback(oldestItem, itemSize));
                                multiRedis.decrby(self.redisKeys.size, itemSize);

                                multiRedis.hdel(self.redisKeys.itemCountInList, oldestItem);
                                multiRedis.hdel(self.redisKeys.itemSize, oldestItem);
                            } else {
                                multiRedis.hincrby(self.redisKeys.itemCountInList, oldestItem, -1);
                            }
                            multiRedis.exec();

                            gcAgain();
                        });
                }
            });
        }
      , gcAgain = function () {
            redis.get(self.redisKeys.size, function (err, size) {
                if (size > self.bounds.low) {
                    gc();
                } else {
                    self.gcStarted = false;
                    log.debug('gc done, now size: ' + size);
                }
            })
        }
        // This callback is for deletion failed
        // if delete failed, we should save data back to LRU
      , failCallback = function (key, bytes) {
            return function (isSuccess) {
                if (! isSuccess) {
                    self.refresh(key, bytes);
                    log.error('deleting item failed: ' + key);
                }
            };
        };

    // forbid gc twice at the same time.
    if (self.gcStarted) {
        return ;
    }
    self.gcStarted = true;
    log.debug('start gc');
    gcAgain();
};

exports.driver = function (driver) {
    return new LRUCache(driver);
}