var FS = require('fs'),
    Yaml = require('js-yaml'),
    conf = Yaml.safeLoad(FS.readFileSync(__dirname + '/../config.yaml').toString('utf8'));
module.exports = conf;