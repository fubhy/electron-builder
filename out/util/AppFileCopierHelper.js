"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ensureEndSlash = ensureEndSlash;
exports.ELECTRON_COMPILE_SHIM_FILENAME = exports.computeFileSets = void 0;

function _bluebirdLst() {
  const data = _interopRequireWildcard(require("bluebird-lst"));

  _bluebirdLst = function () {
    return data;
  };

  return data;
}

function _builderUtil() {
  const data = require("builder-util");

  _builderUtil = function () {
    return data;
  };

  return data;
}

function _fs() {
  const data = require("builder-util/out/fs");

  _fs = function () {
    return data;
  };

  return data;
}

function _fsExtraP() {
  const data = require("fs-extra-p");

  _fsExtraP = function () {
    return data;
  };

  return data;
}

var path = _interopRequireWildcard(require("path"));

function _fileMatcher() {
  const data = require("../fileMatcher");

  _fileMatcher = function () {
    return data;
  };

  return data;
}

function _fileTransformer() {
  const data = require("../fileTransformer");

  _fileTransformer = function () {
    return data;
  };

  return data;
}

function _AppFileWalker() {
  const data = require("./AppFileWalker");

  _AppFileWalker = function () {
    return data;
  };

  return data;
}

function _NodeModuleCopyHelper() {
  const data = require("./NodeModuleCopyHelper");

  _NodeModuleCopyHelper = function () {
    return data;
  };

  return data;
}

let copyHoistedNodeModules = (() => {
  var _ref2 = (0, _bluebirdLst().coroutine)(function* (packager, mainMatcher) {
    const productionDeps = yield packager.productionDeps.value;
    const rootPathToCopier = new Map();

    for (const dep of productionDeps) {
      const index = dep.path.indexOf(_fileTransformer().NODE_MODULES_PATTERN);

      if (index < 0) {
        throw new Error("cannot find node_modules in the path " + dep.path);
      }

      const root = dep.path.substring(0, index);
      let list = rootPathToCopier.get(root);

      if (list == null) {
        list = [];
        rootPathToCopier.set(root, list);
      }

      list.push(dep);
    } // mapSeries instead of map because copyNodeModules is concurrent and so, no need to increase queue/pressure


    return yield _bluebirdLst().default.mapSeries(rootPathToCopier.keys(), (() => {
      var _ref3 = (0, _bluebirdLst().coroutine)(function* (source) {
        // use main matcher patterns, so, user can exclude some files in such hoisted node modules
        const matcher = new (_fileMatcher().FileMatcher)(source, mainMatcher.to, mainMatcher.macroExpander, mainMatcher.patterns);
        const copier = new (_NodeModuleCopyHelper().NodeModuleCopyHelper)(matcher, packager);
        const files = yield copier.collectNodeModules(rootPathToCopier.get(source));
        return validateFileSet({
          src: matcher.from,
          destination: matcher.to,
          files,
          metadata: copier.metadata
        });
      });

      return function (_x7) {
        return _ref3.apply(this, arguments);
      };
    })());
  });

  return function copyHoistedNodeModules(_x5, _x6) {
    return _ref2.apply(this, arguments);
  };
})();

let compileUsingElectronCompile = (() => {
  var _ref4 = (0, _bluebirdLst().coroutine)(function* (mainFileSet, packager) {
    _builderUtil().log.info("compiling using electron-compile");

    const electronCompileCache = yield packager.tempDirManager.getTempDir({
      prefix: "electron-compile-cache"
    });
    const cacheDir = path.join(electronCompileCache, ".cache"); // clear and create cache dir

    yield (0, _fsExtraP().ensureDir)(cacheDir);
    const compilerHost = yield (0, _fileTransformer().createElectronCompilerHost)(mainFileSet.src, cacheDir);
    const nextSlashIndex = mainFileSet.src.length + 1; // pre-compute electron-compile to cache dir - we need to process only subdirectories, not direct files of app dir

    yield _bluebirdLst().default.map(mainFileSet.files, file => {
      if (file.includes(_fileTransformer().NODE_MODULES_PATTERN) || file.includes(BOWER_COMPONENTS_PATTERN) || !file.includes(path.sep, nextSlashIndex) // ignore not root files
      || !mainFileSet.metadata.get(file).isFile()) {
        return null;
      }

      return compilerHost.compile(file).then(() => null);
    }, _fs().CONCURRENCY);
    yield compilerHost.saveConfiguration();
    const metadata = new Map();
    const cacheFiles = yield (0, _fs().walk)(cacheDir, file => !file.startsWith("."), {
      consume: (file, fileStat) => {
        if (fileStat.isFile()) {
          metadata.set(file, fileStat);
        }

        return null;
      }
    }); // add shim

    const shimPath = `${mainFileSet.src}${path.sep}${ELECTRON_COMPILE_SHIM_FILENAME}`;
    mainFileSet.files.push(shimPath);
    mainFileSet.metadata.set(shimPath, {
      isFile: () => true,
      isDirectory: () => false,
      isSymbolicLink: () => false
    });

    if (mainFileSet.transformedFiles == null) {
      mainFileSet.transformedFiles = new Map();
    }

    mainFileSet.transformedFiles.set(mainFileSet.files.length - 1, `
'use strict';
require('electron-compile').init(__dirname, require('path').resolve(__dirname, '${packager.metadata.main || "index"}'), true);
`);
    return {
      src: electronCompileCache,
      files: cacheFiles,
      metadata,
      destination: mainFileSet.destination
    };
  });

  return function compileUsingElectronCompile(_x8, _x9) {
    return _ref4.apply(this, arguments);
  };
})(); // sometimes, destination may not contain path separator in the end (path to folder), but the src does. So let's ensure paths have path separators in the end


function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

let computeFileSets = (() => {
  var _ref = (0, _bluebirdLst().coroutine)(function* (matchers, transformer, packager, isElectronCompile) {
    const fileSets = [];
    let hoistedNodeModuleFileSets = null;
    let isHoistedNodeModuleChecked = false;

    for (const matcher of matchers) {
      const fileWalker = new (_AppFileWalker().AppFileWalker)(matcher, packager);
      const fromStat = yield (0, _fs().statOrNull)(matcher.from);

      if (fromStat == null) {
        _builderUtil().log.debug({
          directory: matcher.from,
          reason: "doesn't exist"
        }, `skipped copying`);

        continue;
      }

      const files = yield (0, _fs().walk)(matcher.from, fileWalker.filter, fileWalker);
      const metadata = fileWalker.metadata; // https://github.com/electron-userland/electron-builder/issues/2205 Support for hoisted node_modules (lerna + yarn workspaces)

      if (!isHoistedNodeModuleChecked && matcher.from === packager.appDir) {
        isHoistedNodeModuleChecked = true; // in the prepacked mode no package.json

        const packageJsonStat = yield (0, _fs().statOrNull)(path.join(packager.appDir, "package.json"));

        if (packageJsonStat != null && packageJsonStat.isFile()) {
          hoistedNodeModuleFileSets = yield copyHoistedNodeModules(packager, matcher);
        }
      }

      const transformedFiles = new Map();

      if (transformer != null) {
        yield _bluebirdLst().default.filter(files, (it, index) => {
          const fileStat = metadata.get(it);

          if (fileStat == null || !fileStat.isFile()) {
            return false;
          }

          const transformedValue = transformer(it);

          if (transformedValue == null) {
            return false;
          }

          if (typeof transformedValue === "object" && "then" in transformedValue) {
            return transformedValue.then(it => {
              if (it != null) {
                transformedFiles.set(index, it);
              }

              return false;
            });
          }

          transformedFiles.set(index, transformedValue);
          return false;
        }, _fs().CONCURRENCY);
      }

      fileSets.push(validateFileSet({
        src: matcher.from,
        files,
        metadata,
        transformedFiles,
        destination: matcher.to
      }));
    }

    if (isElectronCompile) {
      // cache files should be first (better IO)
      fileSets.unshift((yield compileUsingElectronCompile(fileSets[0], packager)));
    }

    if (hoistedNodeModuleFileSets != null) {
      return fileSets.concat(hoistedNodeModuleFileSets);
    }

    return fileSets;
  });

  return function computeFileSets(_x, _x2, _x3, _x4) {
    return _ref.apply(this, arguments);
  };
})();

exports.computeFileSets = computeFileSets;

function validateFileSet(fileSet) {
  if (fileSet.src == null || fileSet.src.length === 0) {
    throw new Error("fileset src is empty");
  }

  return fileSet;
}

const BOWER_COMPONENTS_PATTERN = `${path.sep}bower_components${path.sep}`;
/** @internal */

const ELECTRON_COMPILE_SHIM_FILENAME = "__shim.js";
exports.ELECTRON_COMPILE_SHIM_FILENAME = ELECTRON_COMPILE_SHIM_FILENAME;

function ensureEndSlash(s) {
  return s === "" || s.endsWith(path.sep) ? s : s + path.sep;
} 
//# sourceMappingURL=AppFileCopierHelper.js.map