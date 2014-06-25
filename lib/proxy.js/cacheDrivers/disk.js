var conf = require('../config').cache.disk
  , fs = require('fs')
  , initializeFolders = function () {
        var md5Collections = "0123456789abcdef".split('');
        md5Collections.forEach(function (item) {
            var path1 = conf.path + "/" + item;
            if (!fs.existsSync(path1))
                fs.mkdirSync(path1, 0700);
            md5Collections.forEach(function (former) {
                md5Collections.forEach(function (latter) {
                    var path2 = path1 + '/' + former + latter;
                    if (!fs.existsSync(path2))
                        fs.mkdirSync(path2, 0700);
                })
            })
        })
    }
  , keyToFilePath = function (key) {
        var l1 = key.slice(0, 1),
            l2 = key.slice(1, 3);
        return conf.path + "/" + l1 + "/" + l2 + "/" + key;
    }
  , opFinishCallback = function (callback) {
        return function (err) {
            var isSuccess = ! err ? true : false;
            callback && callback(isSuccess);
        };
    };

initializeFolders();

module.exports = {
    get: function (key, callback) {
        var encoding = 'utf8';
        if (Buffer.isBuffer(key)) {
            encoding = null;
        }
        fs.readFile(keyToFilePath(key), {encoding: encoding}, function (err, item) {
            if (err) {
                item = null;
            }
            callback(item);
        });
    }
  , set: function (key, item, callback) {
        fs.writeFile(keyToFilePath(key), item, opFinishCallback(callback));
    }
  , del: function (key, callback) {
        fs.unlink(keyToFilePath(key), opFinishCallback(callback));
    }
}