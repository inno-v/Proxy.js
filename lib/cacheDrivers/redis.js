var redis = require('../redis');

module.exports = {
    key: function (key) {
        var prefix = redis.conf.prefix + ':items:'
        if (Buffer.isBuffer(key)) {
            var buffers = [new Buffer(prefix), key]
            return Buffer.concat(buffers)
        } else {
            return prefix + key 
        }
    }
  , get: function (key, callback) {
        redis.get(this.key(key), function (err, item) {
            callback(item)
        });
    }
  , set: function (key, item) {
        redis.set(this.key(key), item)
    }
  , del: function (key) {
        redis.del(this.key(key))
    }
}