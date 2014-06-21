var conf = require('../config').redis
  , redis = require('redis').createClient(conf.port, conf.host, {
    detect_buffers: true
});


redis.conf = conf
module.exports = redis