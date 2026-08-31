// resolves . and .. elements in a path array with directory names there
// must be no slashes or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
    var res = [];
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i];

        // ignore empty parts
        if (!p || p === '.')
            continue;

        if (p === '..') {
            if (res.length && res[res.length - 1] !== '..') {
                res.pop();
            } else if (allowAboveRoot) {
                res.push('..');
            }
        } else {
            res.push(p);
        }
    }

    return res;
}

module.exports = normalizeArray
