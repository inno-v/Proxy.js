var cache = {}
  , getItem = function (key) {
        return cache[key] === undefined || cache[key] === null ? null : cache[key]
    };
module.exports = {
    get: function (key, callback) {
        callback(getItem(key));
    }
  , set: function (key, item, callback) {
        try {
            cache[key] = item;
            callback && callback(true);
        } catch (e) {
            callback && callback(false);
        }
    }
  , del: function (key, callback) {
        cache[key] = null
        callback && callback(true);
    }
}