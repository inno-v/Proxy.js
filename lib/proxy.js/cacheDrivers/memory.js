var cache = {};
module.exports = {
    getItem: function (key) {
        return cache[key] === undefined || cache[key] === null ? null : cache[key]
    }
  , get: function (key, callback) {
        callback(this.getItem(key));
    }
  , set: function (key, item) {
        cache[key] = item
    }
  , del: function (key) {
        cache[key] = null
    }
}