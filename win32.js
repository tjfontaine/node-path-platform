var normalizeArray = require('./normalize_array');

// Regex to split a windows path into three parts: [*, device, slash,
// tail] windows-only
var splitDeviceRe =
    /^([a-zA-Z]:|[\\\/]{2}[^\\\/]+[\\\/]+[^\\\/]+)?([\\\/])?([\s\S]*?)$/;

// Regex to split the tail part of the above into [*, dir, basename, ext]
var splitTailRe =
    /^([\s\S]*?)((?:\.{1,2}|[^\\\/]+?|)(\.[^.\/\\]*|))(?:[\\\/]*)$/;

var win32 = {};

// Function to split a filename into [root, dir, basename, ext]
function win32SplitPath(filename) {
    // Separate device+slash from tail
    var result = splitDeviceRe.exec(filename),
        device = (result[1] || '') + (result[2] || ''),
        tail = result[3] || '';
    // Split the tail into dir, basename and extension
    var result2 = splitTailRe.exec(tail),
        dir = result2[1],
        basename = result2[2],
        ext = result2[3];
    return [device, dir, basename, ext];
}

var normalizeUNCRoot = function(device) {
    return '\\\\' + device.replace(/^[\\\/]+/, '').replace(/[\\\/]+/g, '\\');
};

// path.resolve([from ...], to)
win32.resolve = function() {
    var resolvedDevice = '',
        resolvedTail = '',
        resolvedAbsolute = false;

    for (var i = arguments.length - 1; i >= -1; i--) {
        var path;
        if (i >= 0) {
            path = arguments[i];
        } else if (!resolvedDevice) {
            path = process.cwd();
        } else {
            // Windows has the concept of drive-specific current working
            // directories. If we've resolved a drive letter but not yet an
            // absolute path, get cwd for that drive. We're sure the device is not
            // an unc path at this points, because unc paths are always absolute.
            path = process.env['=' + resolvedDevice];
            // Verify that a drive-local cwd was found and that it actually points
            // to our drive. If not, default to the drive's root.
            if (!path || path.substr(0, 3).toLowerCase() !==
                resolvedDevice.toLowerCase() + '\\') {
                path = resolvedDevice + '\\';
            }
        }

        // Skip empty and invalid entries
        if (!util.isString(path)) {
            throw new TypeError('Arguments to path.resolve must be strings');
        } else if (!path) {
            continue;
        }

        var result = splitDeviceRe.exec(path),
            device = result[1] || '',
            isUnc = device && device.charAt(1) !== ':',
            isAbsolute = win32.isAbsolute(path),
            tail = result[3];

        if (device &&
            resolvedDevice &&
            device.toLowerCase() !== resolvedDevice.toLowerCase()) {
            // This path points to another device so it is not applicable
            continue;
        }

        if (!resolvedDevice) {
            resolvedDevice = device;
        }
        if (!resolvedAbsolute) {
            resolvedTail = tail + '\\' + resolvedTail;
            resolvedAbsolute = isAbsolute;
        }

        if (resolvedDevice && resolvedAbsolute) {
            break;
        }
    }

    // Convert slashes to backslashes when `resolvedDevice` points to an UNC
    // root. Also squash multiple slashes into a single one where appropriate.
    if (isUnc) {
        resolvedDevice = normalizeUNCRoot(resolvedDevice);
    }

    // At this point the path should be resolved to a full absolute path,
    // but handle relative paths to be safe (might happen when process.cwd()
    // fails)

    // Normalize the tail path
    resolvedTail = normalizeArray(resolvedTail.split(/[\\\/]+/),
        !resolvedAbsolute).join('\\');

    // If device is a drive letter, we'll normalize to lower case.
    if (resolvedDevice && resolvedDevice.charAt(1) === ':') {
        resolvedDevice = resolvedDevice[0].toLowerCase() +
            resolvedDevice.substr(1);
    }

    return (resolvedDevice + (resolvedAbsolute ? '\\' : '') + resolvedTail) ||
        '.';
};


win32.normalize = function(path) {
    var result = splitDeviceRe.exec(path),
        device = result[1] || '',
        isUnc = device && device.charAt(1) !== ':',
        isAbsolute = win32.isAbsolute(path),
        tail = result[3],
        trailingSlash = /[\\\/]$/.test(tail);

    // If device is a drive letter, we'll normalize to lower case.
    if (device && device.charAt(1) === ':') {
        device = device[0].toLowerCase() + device.substr(1);
    }

    // Normalize the tail path
    tail = normalizeArray(tail.split(/[\\\/]+/), !isAbsolute).join('\\');

    if (!tail && !isAbsolute) {
        tail = '.';
    }
    if (tail && trailingSlash) {
        tail += '\\';
    }

    // Convert slashes to backslashes when `device` points to an UNC root.
    // Also squash multiple slashes into a single one where appropriate.
    if (isUnc) {
        device = normalizeUNCRoot(device);
    }

    return device + (isAbsolute ? '\\' : '') + tail;
};


win32.isAbsolute = function(path) {
    var result = splitDeviceRe.exec(path),
        device = result[1] || '',
        isUnc = !!device && device.charAt(1) !== ':';
    // UNC paths are always absolute
    return !!result[2] || isUnc;
};

win32.join = function() {
    function f(p) {
        if (!util.isString(p)) {
            throw new TypeError('Arguments to path.join must be strings');
        }
        return p;
    }

    var paths = Array.prototype.filter.call(arguments, f);
    var joined = paths.join('\\');

    // Make sure that the joined path doesn't start with two slashes, because
    // normalize() will mistake it for an UNC path then.
    //
    // This step is skipped when it is very clear that the user actually
    // intended to point at an UNC path. This is assumed when the first
    // non-empty string arguments starts with exactly two slashes followed by
    // at least one more non-slash character.
    //
    // Note that for normalize() to treat a path as an UNC path it needs to
    // have at least 2 components, so we don't filter for that here.
    // This means that the user can use join to construct UNC paths from
    // a server name and a share name; for example:
    //   path.join('//server', 'share') -> '\\\\server\\share\')
    if (!/^[\\\/]{2}[^\\\/]/.test(paths[0])) {
        joined = joined.replace(/^[\\\/]{2,}/, '\\');
    }

    return win32.normalize(joined);
};


// path.relative(from, to)
// it will solve the relative path from 'from' to 'to', for instance:
// from = 'C:\\orandea\\test\\aaa'
// to = 'C:\\orandea\\impl\\bbb'
// The output of the function should be: '..\\..\\impl\\bbb'
win32.relative = function(from, to) {
    from = win32.resolve(from);
    to = win32.resolve(to);

    // windows is not case sensitive
    var lowerFrom = from.toLowerCase();
    var lowerTo = to.toLowerCase();

    function trim(arr) {
        var start = 0;
        for (; start < arr.length; start++) {
            if (arr[start] !== '') break;
        }

        var end = arr.length - 1;
        for (; end >= 0; end--) {
            if (arr[end] !== '') break;
        }

        if (start > end) return [];
        return arr.slice(start, end + 1);
    }

    var toParts = trim(to.split('\\'));

    var lowerFromParts = trim(lowerFrom.split('\\'));
    var lowerToParts = trim(lowerTo.split('\\'));

    var length = Math.min(lowerFromParts.length, lowerToParts.length);
    var samePartsLength = length;
    for (var i = 0; i < length; i++) {
        if (lowerFromParts[i] !== lowerToParts[i]) {
            samePartsLength = i;
            break;
        }
    }

    if (samePartsLength == 0) {
        return to;
    }

    var outputParts = [];
    for (var i = samePartsLength; i < lowerFromParts.length; i++) {
        outputParts.push('..');
    }

    outputParts = outputParts.concat(toParts.slice(samePartsLength));

    return outputParts.join('\\');
};


win32._makeLong = function(path) {
    // Note: this will *probably* throw somewhere.
    if (!util.isString(path))
        return path;

    if (!path) {
        return '';
    }

    var resolvedPath = win32.resolve(path);

    if (/^[a-zA-Z]\:\\/.test(resolvedPath)) {
        // path is local filesystem path, which needs to be converted
        // to long UNC path.
        return '\\\\?\\' + resolvedPath;
    } else if (/^\\\\[^?.]/.test(resolvedPath)) {
        // path is network UNC path, which needs to be converted
        // to long UNC path.
        return '\\\\?\\UNC\\' + resolvedPath.substring(2);
    }

    return path;
};


win32.dirname = function(path) {
    var result = win32SplitPath(path),
        root = result[0],
        dir = result[1];

    if (!root && !dir) {
        // No dirname whatsoever
        return '.';
    }

    if (dir) {
        // It has a dirname, strip trailing slash
        dir = dir.substr(0, dir.length - 1);
    }

    return root + dir;
};


win32.basename = function(path, ext) {
    var f = win32SplitPath(path)[2];
    // TODO: make this comparison case-insensitive on windows?
    if (ext && f.substr(-1 * ext.length) === ext) {
        f = f.substr(0, f.length - ext.length);
    }
    return f;
};


win32.extname = function(path) {
    return win32SplitPath(path)[3];
};


win32.format = function(pathObject) {
    if (!util.isObject(pathObject)) {
        throw new TypeError(
            "Parameter 'pathObject' must be an object, not " + typeof pathObject
        );
    }

    var root = pathObject.root || '';

    if (!util.isString(root)) {
        throw new TypeError(
            "'pathObject.root' must be a string or undefined, not " +
            typeof pathObject.root
        );
    }

    var dir = pathObject.dir;
    var base = pathObject.base || '';
    if (dir.slice(dir.length - 1, dir.length) === win32.sep) {
        return dir + base;
    }

    if (dir) {
        return dir + win32.sep + base;
    }

    return base;
};


win32.parse = function(pathString) {
    if (!util.isString(pathString)) {
        throw new TypeError(
            "Parameter 'pathString' must be a string, not " + typeof pathString
        );
    }
    var allParts = win32SplitPath(pathString);
    if (!allParts || allParts.length !== 4) {
        throw new TypeError("Invalid path '" + pathString + "'");
    }
    return {
        root: allParts[0],
        dir: allParts[0] + allParts[1].slice(0, allParts[1].length - 1),
        base: allParts[2],
        ext: allParts[3],
        name: allParts[2].slice(0, allParts[2].length - allParts[3].length)
    };
};


win32.sep = '\\';
win32.delimiter = ';';

module.exports = win32
