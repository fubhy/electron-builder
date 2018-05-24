"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.AppFileWalker = void 0;

var path = _interopRequireWildcard(require("path"));

function _NodeModuleCopyHelper() {
  const data = require("./NodeModuleCopyHelper");

  _NodeModuleCopyHelper = function () {
    return data;
  };

  return data;
}

function _packageDependencies() {
  const data = require("./packageDependencies");

  _packageDependencies = function () {
    return data;
  };

  return data;
}

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const nodeModulesSystemDependentSuffix = `${path.sep}node_modules`;

function addAllPatternIfNeed(matcher) {
  if (!matcher.isSpecifiedAsEmptyArray && (matcher.isEmpty() || matcher.containsOnlyIgnore())) {
    matcher.prependPattern("**/*");
  }

  return matcher;
}
/** @internal */


class AppFileWalker extends _NodeModuleCopyHelper().NodeModuleCopyHelper {
  constructor(matcher, packager) {
    super(addAllPatternIfNeed(matcher), packager);
  } // noinspection JSUnusedGlobalSymbols


  consume(file, fileStat, parent, siblingNames) {
    if (fileStat.isDirectory()) {
      // https://github.com/electron-userland/electron-builder/issues/1539
      // but do not filter if we inside node_modules dir
      if (file.endsWith(nodeModulesSystemDependentSuffix) && !parent.includes("node_modules") && siblingNames.includes("package.json")) {
        return this.handleNodeModulesDir(file, parent);
      }
    } else {
      // save memory - no need to store stat for directory
      this.metadata.set(file, fileStat);
    }

    return this.handleFile(file, fileStat);
  }

  handleNodeModulesDir(nodeModulesDir, parent) {
    const packager = this.packager;
    const isMainNodeModules = parent === packager.appDir;
    return (isMainNodeModules ? packager.productionDeps.value : (0, _packageDependencies().getProductionDependencies)(parent)).then(it => {
      if (packager.debugLogger.enabled) {
        packager.debugLogger.add(`productionDependencies.${parent}`, it.filter(it => it.path.startsWith(nodeModulesDir)).map(it => path.relative(nodeModulesDir, it.path)));
      }

      return this.collectNodeModules(it);
    });
  }

} exports.AppFileWalker = AppFileWalker;
//# sourceMappingURL=AppFileWalker.js.map