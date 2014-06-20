var conf = require('./config')
  , log4js = require('log4js')
  , log = log4js.getLogger()

var LRUCache = function (driver) {
    var myConf = conf.cache[driver]
    this.driverType = driver
    this.driver = require('./cacheDrivers/' + myConf.driver)
    this.bounds = {
        low: myConf.size * myConf.bounds.low
      , high: myConf.size * myConf.bounds.high
    }

    log.debug('cache initilized, bounds: ' + this.bounds.low + ', ' + this.bounds.high)

    this.size = 0
    this.itemList = []
    this.itemCountInList = {}
    this.itemSize = {}
}

LRUCache.prototype.get = function (key, callback) {
    return this.driver.get(key, callback)
}

LRUCache.prototype.set = function (key, item) {
    return this.driver.set(key, item)
}

LRUCache.prototype.refresh = function (key, bytes) {
    this.itemList.unshift(key)
    this.itemSize[key] = bytes

    if (this.itemCountInList[key] === undefined) {
        this.size += bytes
        log.debug('cache refreshed, now size: ' + this.size)
        this.itemCountInList[key] = 1
    } else {
        this.itemCountInList[key] += 1
    }

    if (this.size > this.bounds.high) {
        this.gc()
    }
}

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

exports.driver = function (driver) {
    return new LRUCache(driver);
}