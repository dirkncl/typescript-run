/*
 * simplified version from https://github.com/klesun/ts-browser
 */
function func2String (func) {
	 var stringFunc = func.toString();
	 return stringFunc.substring(stringFunc.indexOf('{') + 1, stringFunc.lastIndexOf('}'))
}

function getWorkerScript(workerScript) {
  return new Promise(function (resolve) {
    var worker_script = func2String(workerScript)
     resolve(worker_script)
  })
}
function TranspilerWorker() {
  const tsURL = 'https://www.unpkg.com/typescript@4.6.2/lib/typescriptServices.js'
  
  const ParseTsURL = 'https://dirkncl.github.io/typescript-run/ParseTsModule.js'
  const main = () => {
      importScripts(tsURL)
      importScripts(ParseTsURL)
      
      const tsBrowser = self.tsBrowser;
      //console.log(tsBrowser)
      /** @type {ts} */
      const ts = self.ts;
      
      const onmessage = (evt) => {
          const {data} = evt;
          //console.log(evt.data)
          const {messageType, messageData, referenceId} = data;
          if (messageType === 'parseTsModule') {
              const {isJsSrc, staticDependencies, dynamicDependencies, getJsCode} =
                  tsBrowser.ParseTsModule_sideEffects({
                      ...messageData, ts: ts,
                      addPathToUrl: tsBrowser.addPathToUrl,
                  });
              self.postMessage({
                  messageType: 'parseTsModule_deps',
                  messageData: {isJsSrc, staticDependencies, dynamicDependencies},
                  referenceId: referenceId,
              });
              const jsCode = getJsCode();
              self.postMessage({
                  messageType: 'parseTsModule_code',
                  messageData: {jsCode},
                  referenceId: referenceId,
              });
          }
      };
  
      self.onmessage = evt => {
          try {
              onmessage(evt);
          } catch (exc) {
              self.postMessage({
                  messageType: 'error',
                  messageData: {
                      message: exc.message,
                      stack: exc.stack,
                  },
              });
          }
      };
  };
  
  try {
      main();
  } catch (exc) {
      self.postMessage('Failed to initialize worker - ' + exc + '\n' + exc.stack);
  }
  
}
//
function utils_js() {
  /** kudos to https://stackoverflow.com/a/37235274/2750743 */
  const oneSuccess = (promises) => {
      return Promise.all(promises.map(p => {
          // If a request fails, count that as a resolution so it will keep
          // waiting for other possible successes. If a request succeeds,
          // treat it as a rejection so Promise.all immediately bails out.
          return p.then(
              val => Promise.reject(val),
              err => Promise.resolve(err)
          );
      })).then(
          // If '.all' resolved, we've just got an array of errors.
          errors => Promise.reject(errors),
          // If '.all' rejected, we've got the result we wanted.
          val => Promise.resolve(val)
      );
  };
  
  /** @cudos to https://stackoverflow.com/a/30106551/2750743 */
  const b64EncodeUnicode = (str) => {
      // first we use encodeURIComponent to get percent-encoded UTF-8,
      // then we convert the percent encodings into raw bytes which
      // can be fed into btoa.
      return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
          function toSolidBytes(match, p1) {
              return String.fromCharCode('0x' + p1);
          }));
  };  
  return { oneSuccess, b64EncodeUnicode}
}

//
function UrlPathResolver_sideEffects_js() {
  var tsBrowser = tsBrowser || {};
  
  tsBrowser.addPathToUrl = (path, baseUrl) => {
      let result;
      if (path.startsWith('/') || path.match(/^https?:\/\//)) {
          // full path from the site root
          result = path;
      } else {
          const urlParts = baseUrl.split('/');
          const pathParts = path.split('/');
  
          if (urlParts.slice(-1)[0] !== '') {
              // does not end with a slash - script, not directory
              urlParts.pop();
          }
  
          // getting rid of trailing slashes if any
          while (pathParts[0] === '') pathParts.shift();
          while (urlParts.slice(-1)[0] === '') urlParts.pop();
  
          const resultParts = [...urlParts];
          for (const pathPart of pathParts) {
              if (pathPart === '..' && resultParts.slice(-1)[0] !== '..') {
                  while (resultParts.slice(-1)[0] === '.') resultParts.pop();
                  if (resultParts.length > 0) {
                      resultParts.pop();
                  } else {
                      resultParts.push('..');
                  }
              } else if (pathPart !== '.') {
                  resultParts.push(pathPart);
              }
          }
          result = resultParts.join('/') || '.';
      }
  
      return result;
  };
  
  const isWorker = typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
  if (isWorker) {
      self.tsBrowser = tsBrowser;
  } else {
      window.tsBrowser = tsBrowser;
  }  
}
//

function UrlPathResolver_js() {
  UrlPathResolver_sideEffects_js()
  const tsBrowser = window.tsBrowser;
  
  const addPathToUrl = tsBrowser.addPathToUrl;
  
  return { addPathToUrl };  
  
}
//
function WorkerManager_js() {
  const { oneSuccess } = utils_js();
  const { addPathToUrl } = UrlPathResolver_js();
  
  const EXPLICIT_EXTENSIONS = ['ts', 'js', 'tsx', 'jsx', 'mjs'];
  
  // on my 4-core PC 3 workers seems to be the optimal solution
  const NUM_OF_WORKERS = 3;
  
  /**
   * this number must supposedly be updated in case generated code
   * format changes, very hope I won't forget to update it every time
   *
   * it's the md5 of the last commit
   */
  
  
  const CACHED_FORMAT_VERSION = 'c364de0a57780ef0d248878f6fd710fff8c6fff9';
   
  const workers = [...Array(NUM_OF_WORKERS).keys()].map(i => {
      const whenWorker = getWorkerScript(TranspilerWorker).then(workerCode => {
          return new Worker(window.URL.createObjectURL(new Blob([workerCode])));
      });
      
  
      let lastReferenceId = 0;
      const referenceIdToCallback = new Map();
  
      whenWorker.then(w => w.onmessage = ({data}) => {
          console.log('Received event from worker #' + i, data);
      });
      
      whenWorker.then(w => w.onmessage = ({data}) => {
          const {messageType, messageData, referenceId} = data;
          const callback = referenceIdToCallback.get(referenceId);
          if (callback) {
              callback({messageType, messageData});
          } else {
              console.debug('Unexpected message from worker #' + i, data);
          }
      });
  
      let whenFree = Promise.resolve();
      return {
          getWhenFree: () => whenFree,
          parseTsModule: (params) => {
              const referenceId = ++lastReferenceId;
              whenWorker.then(w => w.postMessage({
                  messageType: 'parseTsModule',
                  messageData: params,
                  referenceId: referenceId,
              }));
              return new Promise((ok, err) => {
                  let reportJsCodeOk, reportJsCodeErr;
                  referenceIdToCallback.set(referenceId, ({messageType, messageData}) => {
                      if (messageType === 'parseTsModule_deps') {
                          const {isJsSrc, staticDependencies, dynamicDependencies} = messageData;
                          const whenJsCode = new Promise((ok, err) => {
                              [reportJsCodeOk, reportJsCodeErr] = [ok, err];
                          });
                          whenFree = whenJsCode;
                          ok({
                              isJsSrc, staticDependencies,
                              dynamicDependencies, whenJsCode,
                          });
                      } else if (messageType === 'parseTsModule_code') {
                          reportJsCodeOk(messageData.jsCode);
                          referenceIdToCallback.delete(referenceId);
                      } else {
                          const reject = reportJsCodeErr || err;
                          const msg = 'Unexpected parseTsModule() worker response';
                          const exc = new Error(msg);
                          exc.data = {messageType, messageData};
                          reject(exc);
                          referenceIdToCallback.delete(referenceId);
                      }
                  });
              });
          },
      };
  });
  
  const workerCallbackQueue = [];
  const freeWorkers = new Set(workers);
  
  const withFreeWorker = (action) => new Promise((ok, err) => {
      workerCallbackQueue.push(
          worker => Promise.resolve()
              .then(() => action(worker))
              .then(ok).catch(err)
      );
      const checkFree = () => {
          if (freeWorkers.size > 0 &&
              workerCallbackQueue.length > 0
          ) {
              const worker = [...freeWorkers][0];
              freeWorkers.delete(worker);
              const callback = workerCallbackQueue.shift();
              callback(worker).finally(async () => {
                  await worker.getWhenFree().catch(exc => {});
                  freeWorkers.add(worker);
                  checkFree();
              });
          }
      };
      checkFree();
  });
  
  const CACHE_PREFIX = 'ts-browser-cache:';
  
  const resetCache = () => {
      for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith(CACHE_PREFIX)) {
              window.localStorage.removeItem(key);
          }
      }
  };
  
  const getFromCache = ({fullUrl, checksum}) => {
      const absUrl = addPathToUrl(fullUrl, window.location.pathname);
      const cacheKey = CACHE_PREFIX + absUrl;
      const oldResultStr = window.localStorage.getItem(cacheKey);
      let oldResult = null;
      try {
          oldResult = JSON.parse(oldResultStr || 'null');
      } catch (exc) {
          console.warn('Failed to parse cached ' + fullUrl, exc);
      }
  
      if (oldResult && oldResult.checksum === checksum) {
          const {jsCode, ...rs} = oldResult.value;
          return {...rs, whenJsCode: Promise.resolve(jsCode)};
      } else {
          return null;
      }
  };
  
  const putToCache = ({fullUrl, checksum, jsCode, ...rs}) => {
      const absUrl = addPathToUrl(fullUrl, window.location.pathname);
      const cacheKey = CACHE_PREFIX + absUrl;
      window.localStorage.setItem(cacheKey, JSON.stringify({
          checksum, value: {...rs, jsCode},
      }));
  };
  
  /**
   * @cudos https://stackoverflow.com/a/50767210/2750743
   * @param {ArrayBuffer} buffer
   * @return {string}
   */
  function bufferToHex (buffer) {
      return [...new Uint8Array(buffer)]
          .map(b => b.toString(16).padStart(2, "0"))
          .join("");
  }
  
  const WorkerManager = ({compilerOptions}) => {
    
      const fetchModuleSrc = (url) => {
          // typescript does not allow specifying extension in the import, but react
          // files may have .tsx extension rather than .ts, so have to check both
          const urlOptions = [];
          if (EXPLICIT_EXTENSIONS.some(ext => url.endsWith('.' + ext))) {
              urlOptions.push(url);
          } else {
              urlOptions.push(url + '.ts');
              //if (compilerOptions.jsx !== 0 ) {
              //    urlOptions.push(url + '.tsx');
              //}
          }
          return oneSuccess(
              urlOptions.map(fullUrl => fetch(fullUrl).then(rs => {
                      if (rs.status === 200) {
                          return rs.text().then(tsCode => ({fullUrl, tsCode}));
                      } else {
                          const msg = 'Failed to fetch module file ' + rs.status + ': ' + fullUrl;
                          return Promise.reject(new Error(msg));
                      }
                  }))
          );
      };
  
      const parseInWorker = async ({url, fullUrl, tsCode}) => {
          const sourceCodeBytes = new TextEncoder().encode(
              '// ts-browser format version: ' + CACHED_FORMAT_VERSION + '\n' + tsCode
          );
          // only available on https pages, probably should just use some simple inline checksum
          // function, like crc, but bigger than 32 bytes to make sure there won't be collisions
          const checksum = !crypto.subtle ? null : 
              await crypto.subtle.digest(
                  'SHA-256', sourceCodeBytes
              ).then(bufferToHex);
          const fromCache = !checksum ? null : getFromCache({fullUrl, checksum});
          if (fromCache) {
              // ensure `url` won't be taken from cache, as it
              // is often used as key without extension outside
              return {...fromCache, url};
          } else {
              return withFreeWorker(worker => worker.parseTsModule({
                  fullUrl, tsCode, compilerOptions,
              })).then(({whenJsCode, ...importData}) => {
                  const rs = {url, ...importData};
                  if (!checksum) {
                      // can't cache, as hashing function not available on non-https
                  } else if (fullUrl.endsWith('.ts') || fullUrl.endsWith('.tsx')) {
                      whenJsCode.then(jsCode => {
                          putToCache({...rs, fullUrl, checksum, jsCode});
                      });
                  } else {
                      // no caching for large raw js libs
                  }
                  return {...rs, whenJsCode};
              });
          }
      };
  
      return {
          fetchModuleData: url => fetchModuleSrc(url)
              .then(({fullUrl, tsCode}) => parseInWorker({url, fullUrl, tsCode})),
      };
  };
  
  WorkerManager.resetCache = resetCache;
  
  return WorkerManager;
  
  
}
//
function sideEffectModules_sideEffectUtils_js() {
  const tryEvalLegacyJsModule = (jsCode, silent = true) => {
      try {
          // trying to support non es6 modules
          const globalsBefore = new Set(Object.keys(window));
          const self = {};
          
          const evalResult = eval.apply(self, [jsCode]);
          //const evalResult = Function("return " + jsCode)();
          
          const newGlobals = Object.keys(window).filter(k => !globalsBefore.has(k));
          
          const result = {};
          for (const name of newGlobals) {
              result[name] = window[name];
          }
          if (new Set(newGlobals.map(g => window[g])).size === 1) {
              result['default'] = window[newGlobals[0]];
          }
          const name = jsCode.slice(-100).replace(/[\s\S]*\//, '');
          console.debug('side-effects js lib loaded ' + name, {
              newGlobals, evalResult, self,
          });
          if (newGlobals.length === 0) {
              const msg = 'warning: imported lib ' + name + ' did not add any keys to window. ' +
                  'If it is imported in both html and js, you can only use it with side-effects ' +
                  'import like `import "someLib.js"; const someLib = window.someLib;`';
              console.warn(msg);
              return {warning: msg, self};
          } else {
              return result;
          }
      } catch (exc) {
          if (silent) {
              // Unexpected token 'import/export' - means it is a es6 module
              return null;
          } else {
              throw exc;
          }
      }
  };  
  return { tryEvalLegacyJsModule }
}

function ts_browser() {
  const { b64EncodeUnicode } = utils_js();
  const { addPathToUrl } = UrlPathResolver_js();
  const WorkerManager = WorkerManager_js();
  const { tryEvalLegacyJsModule } = sideEffectModules_sideEffectUtils_js();
  
  const CACHE_LOADED = 'ts-browser-loaded-modules';
  const IMPORT_DYNAMIC = 'ts-browser-import-dynamic';
  
  /**
   * @module ts-browser - like ts-node, this tool allows you
   * to require typescript files and compiles then on the fly
   */
  
  const makeCircularRefProxy = (whenModule, newUrl) => {
      // from position of an app writer, it would be better to just not use circular
      // references, but since typescript supports them somewhat, so should I I guess
      let loadedModule = null;
      whenModule.then(module => loadedModule = module);
      return new Proxy({}, {
          get: (target, name) => {
              return new Proxy(() => {}, {
                  apply: (callTarget, thisArg, argumentsList) => {
                      if (loadedModule) {
                          return loadedModule[name].apply(thisArg, argumentsList);
                      } else {
                          throw new Error('Tried to call ' + name + '() on a circular reference ' + newUrl);
                      }
                  },
                  get: (target, subName) => {
                      if (loadedModule) {
                          return loadedModule[name][subName];
                      } else {
                          throw new Error('Tried to get field ' + name + '.' + subName + ' on a circular reference ' + newUrl);
                      }
                  },
              });
          },
      });
  };
  window[CACHE_LOADED] = window[CACHE_LOADED] || {};
  
  /** @return {Promise<Module>} */
  const loadModuleFromFiles = (baseUrl, cachedFiles) => {
      const modulePromises = {};
      const load = async (baseUrl) => {
          if (window[CACHE_LOADED][baseUrl]) {
              // it was already loaded by another dynamic import
              return Promise.resolve(window[CACHE_LOADED][baseUrl]);
          }
          const fileData = cachedFiles[baseUrl];
          let jsCode = await fileData.whenJsCode;
          for (const dependency of fileData.staticDependencies) {
              const newUrl = dependency.url;
              if (!modulePromises[newUrl]) {
                  let reportOk, reportErr;
                  modulePromises[newUrl] = new Promise((ok,err) => {
                      [reportOk, reportErr] = [ok, err];
                  });
                  load(newUrl).then(reportOk).catch(reportErr);
                  window[CACHE_LOADED][newUrl] = await modulePromises[newUrl];
              } else if (!window[CACHE_LOADED][newUrl]) {
                  if (jsCode.match(/(^|\s+)export\b/)) {
                      // the check is to exclude type definition-only files, as they have no vars
                      const msg = 'warning: circular dependency on ' + baseUrl + ' -> ' +
                          newUrl + ', variables will be empty in module top-level scope';
                      console.warn(msg);
                  }
                  window[CACHE_LOADED][newUrl] = makeCircularRefProxy(modulePromises[newUrl], newUrl);
              }
          }
          jsCode = jsCode + '\n' +
              '//# sourceURL=' + baseUrl;
          const base64Code = b64EncodeUnicode(jsCode);
          if (fileData.isJsSrc) {
              const loaded = tryEvalLegacyJsModule(jsCode);
              if (loaded) {
                  // only side effect imports supported, as binding
                  // AMD/CJS modules with es6 has some problems
                  return Promise.resolve(loaded);
              }
          }
          return import('data:text/javascript;base64,' + base64Code);
      };
  
      return load(baseUrl);
  };
  
  /** ts.ScriptTarget.ES2018 */
  const TS_SCRIPT_TARGET_ES2018 = 5;

  /** @param {ts.CompilerOptions} compilerOptions */
  const LoadRootModule = async ({
      rootModuleUrl,
      compilerOptions = {},
  }) => {
      compilerOptions.target = compilerOptions.target || TS_SCRIPT_TARGET_ES2018;
      const workerManager = WorkerManager({compilerOptions});
  
      const cachedFiles = {};
      const urlToWhenFileData = {};
      const getFileData = url => {
          if (!urlToWhenFileData[url]) {
              urlToWhenFileData[url] = workerManager.fetchModuleData(url);
          }
          return urlToWhenFileData[url];
      };
  
      const dynamicImportUrls = new Set();
      const fetchDependencyFiles = async (entryUrl) => {
          dynamicImportUrls.add(entryUrl);
          const urlToPromise = {};
          urlToPromise[entryUrl] = getFileData(entryUrl);
          let promises;
          let safeguard = 10000;
          while ((promises = Object.values(urlToPromise)).length > 0) {
              if (--safeguard <= 0) {
                  throw new Error('Got into infinite loop while fetching dependencies of ' + entryUrl);
              }
              const next = await Promise.race(promises);
              cachedFiles[next.url] = next;
              delete urlToPromise[next.url];
              for (const {url} of next.staticDependencies) {
                  if (!urlToPromise[url] && !cachedFiles[url]) {
                      urlToPromise[url] = getFileData(url);
                  }
              }
              for (const dep of next.dynamicDependencies) {
                  if (dep.url) {
                      if (!cachedFiles[dep.url] && !dynamicImportUrls.has(dep.url)) {
                          // preload dynamic dependency files for optimization
                          fetchDependencyFiles(dep.url);
                      }
                  }
              }
          }
          return cachedFiles;
      };
  
      const importDynamic = async (relUrl, baseUrl) => {
          try {
              const url = addPathToUrl(relUrl, baseUrl);
              await fetchDependencyFiles(url);
              return await loadModuleFromFiles(url, cachedFiles);
          } catch (exc) {
              console.warn('Resetting transpilation cache due to uncaught error');
              WorkerManager.resetCache();
              throw exc;
          }
      };
  
      const main = async () => {
          window[IMPORT_DYNAMIC] = importDynamic;
          return importDynamic(rootModuleUrl, './');
      };
  
      return main();
  };
  
  /** @return {Promise<any>} */
  const loadModule = async (absUrl, compilerOptions = {}) => {
      return LoadRootModule({rootModuleUrl: absUrl, compilerOptions});
  };
  
  return loadModule
}

export const loadModule = ts_browser()
