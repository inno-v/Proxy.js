var fs = require('fs')
  , yaml = require('js-yaml')
  , conf = require('./lib/proxy.js/config')
  , realConf = yaml.safeLoad(fs.readFileSync(__dirname + '/config.yaml').toString('utf8'));

for (var key in realConf) {
    conf[key] = realConf[key];
}

require('./lib/index');