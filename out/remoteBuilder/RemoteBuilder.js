"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RemoteBuilder = void 0;

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

function _http() {
  const data = require("http2");

  _http = function () {
    return data;
  };

  return data;
}

var path = _interopRequireWildcard(require("path"));

function _util() {
  const data = require("util");

  _util = function () {
    return data;
  };

  return data;
}

function _ProjectInfoManager() {
  const data = require("./ProjectInfoManager");

  _ProjectInfoManager = function () {
    return data;
  };

  return data;
}

function _RemoteBuildManager() {
  const data = require("./RemoteBuildManager");

  _RemoteBuildManager = function () {
    return data;
  };

  return data;
}

let findBuildAgent = (() => {
  var _ref = (0, _bluebirdLst().coroutine)(function* () {
    const result = process.env.ELECTRON_BUILD_SERVICE_ENDPOINT;

    if (result != null) {
      _builderUtil().log.debug({
        endpoint: result
      }, `endpoint is set explicitly`);

      return result.startsWith("http") ? result : `https://${result}`;
    }

    const rawUrl = process.env.ELECTRON_BUILD_SERVICE_ROUTER_HOST || "206.189.255.57"; // add random query param to prevent caching

    const routerUrl = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;

    _builderUtil().log.debug({
      routerUrl
    }, "");

    const client = (0, _http().connect)(routerUrl, (0, _RemoteBuildManager().getConnectOptions)());
    return yield new (_bluebirdLst().default)((resolve, reject) => {
      client.on("socketError", reject);
      client.on("error", reject);
      client.setTimeout(10 * 1000, () => {
        reject(new Error("Timeout"));
      });
      const stream = client.request({
        [_http().constants.HTTP2_HEADER_PATH]: `/find-build-agent?c=${Date.now().toString(32)}`,
        [_http().constants.HTTP2_HEADER_METHOD]: _http().constants.HTTP2_METHOD_GET
      });
      stream.on("error", reject);
      stream.on("response", headers => {
        if (!(0, _RemoteBuildManager().checkStatus)(headers[_http().constants.HTTP2_HEADER_STATUS], reject)) {
          return;
        }

        stream.setEncoding("utf8");
        let data = "";
        stream.on("end", () => {
          try {
            if (_builderUtil().log.isDebugEnabled) {
              _builderUtil().log.debug({
                data
              }, "remote build response");
            }

            resolve(JSON.parse(data).endpoint);
          } catch (e) {
            throw new Error(`Cannot parse response: ${data}`);
          }
        });
        stream.on("data", chunk => {
          data += chunk;
        });
      });
    }).finally(() => {
      client.destroy();
    });
  });

  return function findBuildAgent() {
    return _ref.apply(this, arguments);
  };
})(); function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

const errorCodes = new Set(["ECONNREFUSED", "ECONNRESET"]);

class RemoteBuilder {
  constructor(packager) {
    this.packager = packager;
    this.toBuild = new Map();
    this.buildStarted = false;
  }

  scheduleBuild(target, arch, unpackedDirectory) {
    if (!(0, _builderUtil().isEnvTrue)(process.env._REMOTE_BUILD) && this.packager.config.remoteBuild === false) {
      throw new Error("Target is not supported on your OS and using of Electron Build Service is disabled (\"remoteBuild\" option)");
    }

    let list = this.toBuild.get(arch);

    if (list == null) {
      list = [];
      this.toBuild.set(arch, list);
    }

    list.push({
      name: target.name,
      arch: _builderUtil().Arch[arch],
      unpackedDirectory,
      outDir: target.outDir
    });
  }

  build() {
    if (this.buildStarted) {
      return Promise.resolve();
    }

    this.buildStarted = true;
    return _bluebirdLst().default.mapSeries(Array.from(this.toBuild.keys()), arch => {
      return this._build(this.toBuild.get(arch), this.packager);
    });
  } // noinspection JSMethodCanBeStatic


  _build(targets, packager) {
    return (0, _bluebirdLst().coroutine)(function* () {
      if (_builderUtil().log.isDebugEnabled) {
        _builderUtil().log.debug({
          remoteTargets: JSON.stringify(targets, null, 2)
        }, "remote building");
      }

      const projectInfoManager = new (_ProjectInfoManager().ProjectInfoManager)(packager.info);
      let result = null;

      for (let attempt = 0; true; attempt++) {
        const endpoint = yield findBuildAgent(); // for now assume that all targets has the same outDir (correct for Linux)

        const buildManager = new (_RemoteBuildManager().RemoteBuildManager)(endpoint, projectInfoManager, targets[0].unpackedDirectory, targets[0].outDir, packager);
        const setTimeoutPromise = (0, _util().promisify)(setTimeout);

        try {
          result = yield buildManager.build({
            "x-build-request": JSON.stringify({
              targets: targets.map(it => {
                return {
                  name: it.name,
                  arch: it.arch,
                  unpackedDirName: path.basename(it.unpackedDirectory)
                };
              }),
              platform: packager.platform.buildConfigurationKey
            })
          });
          break;
        } catch (e) {
          const errorCode = e.code;

          if (!errorCodes.has(errorCode) || attempt > 3) {
            if (errorCode === "ECONNREFUSED") {
              const error = new Error(`Cannot connect to electron build service ${endpoint}: ${e.message}`);
              e.code = errorCode;
              throw error;
            } else {
              throw e;
            }
          }

          const waitTime = 4000 * (attempt + 1);
          console.warn(`Attempt ${attempt + 1}: ${e.message}\nWaiting ${waitTime / 1000}s...`);
          yield setTimeoutPromise(waitTime, "wait");
        }
      }

      if (result != null && result.error != null) {
        throw new Error(`Remote builder error (if you think that it is not your application misconfiguration issue, please file issue to https://github.com/electron-userland/electron-builder/issues):\n\n${result.error}`);
      }
    })();
  }

}

exports.RemoteBuilder = RemoteBuilder;
//# sourceMappingURL=RemoteBuilder.js.map