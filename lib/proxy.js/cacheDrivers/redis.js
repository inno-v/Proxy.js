var redis = require('../redis')
  , findKey = function (key) {
        var prefix = redis.conf.prefix + ':items:';
        if (Buffer.isBuffer(key)) {
            var buffers = [new Buffer(prefix), key];
            return Buffer.concat(buffers);
        } else {
            return prefix + key;
        }
    }
  , opFinishCallback = function (callback) {
        return function (err) {
            var isSuccess = ! err ? true : false;
            callback && callback(isSuccess);
        };
    };

module.exports = {
    get: function (key, callback) {
        redis.get(findKey(key), function (err, item) {
            callback(item);
        });
    }
  , set: function (key, item, callback) {
        redis.set(findKey(key), item, opFinishCallback(callback));
    }
  , del: function (key, callback) {
        redis.del(findKey(key), opFinishCallback(callback));
    }
}