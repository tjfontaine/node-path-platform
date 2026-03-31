var _util = require('util');

function isString(arg) {
  return typeof arg === 'string';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}


exports = module.exports = _util;

if (!_util.isString) {
  exports.isString = isString;
}

if (!_util.isObject) {
  exports.isObject = isObject;
}
