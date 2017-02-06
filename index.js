'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TiipSocket = undefined;

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _observableSocket = require('observable-socket');

var _observableSocket2 = _interopRequireDefault(_observableSocket);

var _jstiip = require('jstiip');

var tiip = _interopRequireWildcard(_jstiip);

var _immutable = require('immutable');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var initTarget = 'TiipController';
var timeoutOnRequests = 30 * 1000;
var midMax = 10000;
var timeoutErrorMessage = 'Timeout';
var nonMetaFields = _immutable.Set.of('timestamp', 'source', 'signal', 'payload', 'clientTime');

var globalVar = typeof global !== 'undefined' // eslint-disable-line
? global : typeof window !== 'undefined' ? window : {};

var TiipSocket = exports.TiipSocket = function () {
  function TiipSocket(url) {
    var _this = this;

    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, TiipSocket);

    this.clearCallbacks = function () {
      console.log('TiipSocket:clearCallbacks');
      _this.reqCallbacks.forEach(function (reqObj) {
        clearTimeout(reqObj.get('timeoutPromise'));
        reqObj.get('reject')(new Error('Clearing all requests'));
      });
      _this.reqCallbacks = _this.reqCallbacks.clear();
      _this.subCallbacks = _this.subCallbacks.clear();
    };

    this.callSubCallback = function (channel, msgObj) {
      var callback = _this.subCallbacks.getIn([channel, 'callback']);
      if (callback) {
        callback(msgObj.filter(function (v, field) {
          return nonMetaFields.has(field);
        }));
      }
    };

    this.onMessage = function (msg) {
      console.log('TiipSocket:onMessage:', msg);
      var msgObj = void 0;
      var isTiip = true;
      var errorReason = undefined;

      try {
        msgObj = (0, _immutable.fromJS)(tiip.unpack(msg.data));
        // console.log('Msg received: ', msgObj);
      } catch (err) {
        isTiip = false; // non-tiip messge
        // console.log('Msg received: ', msg.data);
      }

      if (isTiip) {
        switch (msgObj.get('type')) {
          case 'rep':
            {
              var mid = msgObj.get('mid');
              var reqCallbackObj = _this.reqCallbacks.get(mid);
              // If an object exists with msgObj.mid in reqCallbacks, resolve it
              if (mid && reqCallbackObj) {
                clearTimeout(reqCallbackObj.get('timeoutPromise'));
                if (msgObj.get('ok')) {
                  reqCallbackObj.get('resolve', Function.prototype)(msgObj);
                } else {
                  reqCallbackObj.get('reject', Function.prototype)(new Error('Request error, or denied. ' + msgObj.getIn(['payload', 0], '')));
                  errorReason = 'Request error, or denied';
                }
                _this.reqCallbacks = _this.reqCallbacks.delete(mid);
              } else {
                errorReason = 'No request matched server reply';
              }
              break;
            }
          case 'pub':
            {
              var _ret = function () {
                var channel = msgObj.get('channel');
                // First, try exact matching:
                var done = _this.subCallbacks.forEach(function (value, key) {
                  if (key === channel) {
                    _this.callSubCallback(key, msgObj);
                    return false; // done
                  }
                  return true;
                });
                // Then, if no callback found, try subchannel matching:
                if (!done) {
                  done = _this.subCallbacks.forEach(function (value, key) {
                    if (key === channel.substring(0, key.length)) {
                      _this.callSubCallback(key, msgObj);
                      return false; // done
                    }
                    return true;
                  });
                }
                if (!done) {
                  // No key found
                  errorReason = 'No subscription for publication from server';
                }
                return 'break';
              }();

              if (_ret === 'break') break;
            }
          default:
            {
              errorReason = 'Unknown message type';
            }
        }
      }
      if (_this.receiveCallback) {
        if (isTiip) {
          _this.receiveCallback(msgObj, errorReason, msgObj.get('type'));
        } else {
          _this.receiveCallback(msg.data);
        }
      }
    };

    this.currentCallbackId = 0;
    this.reqCallbacks = (0, _immutable.Map)();
    this.subCallbacks = (0, _immutable.Map)();
    this.setOptions(url, options);
  }

  _createClass(TiipSocket, [{
    key: 'getSocketConstructor',
    value: function getSocketConstructor() {
      return this.customWsClient || globalVar.WebSocket || globalVar.MozWebSocket;
    }
  }, {
    key: 'connect',
    value: function connect(url) {
      var _this2 = this;

      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      this.setOptions(url, options);
      var urlOk = /wss?:\/\//.exec(url);
      if (!urlOk) {
        throw new Error('Invalid url provided');
      }
      var wsConstr = this.customWsClient || globalVar.WebSocket || globalVar.MozWebSocket;
      this.oSocket = (0, _observableSocket2.default)(wsConstr(this.url));
      this.oSocket.down.subscribe(this.onMessage, this.onError, function (ev) {
        _this2.clearCallbacks();
        window.requestIdleCallback(function () {
          _this2.oSocket = undefined;
          _this2.onClose(ev);
        });
      });
      return this;
    }
  }, {
    key: 'setOptions',
    value: function setOptions(url, options) {
      if (url) {
        this.url = url;
        this.isEncrypted = /^(wss:)/i.test(this.url);
      }
      if (options.customWsClient) {
        this.customWsClient = options.customWsClient;
      }
      if (options.onSend) this.sendCallback = options.onSend;
      if (options.onReceive) this.receiveCallback = options.onReceive;
      if (options.onError) {
        this.onError = options.onError || function (err) {
          return console.error('Socket error:', err);
        };
      }
      if (options.onClose) {
        this.onClose = options.onClose || function (ev) {
          return console.warn('Socket closed:', ev.code, ev.reason);
        };
      }
      if (options.timeoutOnRequests) {
        this.timeoutOnRequests = options.timeoutOnRequests || timeoutOnRequests;
      }
    }
  }, {
    key: 'init',
    value: function init(userId, passwordHash, tenant, target, signal, args) {
      console.log('TiipSocket:init');
      var argumentz = { id: userId, password: passwordHash };
      if (args) {
        argumentz = _extends({}, args, argumentz);
      }
      return this.request('init', target || initTarget, signal, argumentz, undefined, tenant);
    }
  }, {
    key: 'isOpen',
    value: function isOpen() {
      return this.oSocket.ws.readyState === 1;
    }
  }, {
    key: 'bufferedAmount',
    value: function bufferedAmount() {
      return this.oSocket.ws.socket.bufferedAmount;
    }
  }, {
    key: 'kill',
    value: function kill(force) {
      return this.oSocket.ws.close(force);
    }
  }, {
    key: 'req',
    value: function req(target, signal, args, tenant) {
      return this.request('req', target, signal, args, undefined, tenant);
    }
  }, {
    key: 'sub',
    value: function sub(callback, channel, subChannel, tenant, args) {
      var _this3 = this;

      var secondaryKey = _immutable.OrderedSet.of(channel, subChannel, tenant);
      var argumentz = void 0;
      if (subChannel) {
        argumentz = { subChannel: subChannel };
        if (args) argumentz = _extends({}, args, argumentz);
      } else if (args) {
        argumentz = args;
      }

      return this.request('sub', undefined, undefined, argumentz, undefined, tenant, undefined, channel).then(function (tiipMsg) {
        if (tiipMsg.has('channel')) {
          // Only support for subscription to one channel at a time
          _this3.subCallbacks = _this3.subCallbacks.set(tiipMsg.get('channel'), (0, _immutable.Map)({
            callback: callback,
            key: secondaryKey
          }));
        }
        return tiipMsg;
      });
    }

    /**
     * (FUTURE) Subscribe to multiple channels. UNTESTED!
     * @param {object} subscriptions as List:[{ callback:<func>, rid:<rid>, subChannel:<>}]
     */

  }, {
    key: 'subMulti',
    value: function subMulti(subscriptions, tenant, args) {
      var _this4 = this;

      var ridToSubscr = subscriptions.toMap().mapKeys(function (key, val) {
        return val.get('rid', key);
      });
      var argumentz = { subscriptions: subscriptions.map(function (s) {
          return s.delete('callback');
        }).toJS() };
      if (args) argumentz = _extends({}, args, argumentz);

      return this.request('sub', undefined, undefined, argumentz, undefined, tenant, undefined).then(function (tiipMsg) {
        _this4.subCallbacks = _this4.subCallbacks.merge(
        // payload to map on actual channels:
        tiipMsg.get('payload', (0, _immutable.List)()).toMap().mapKeys(function (key, s) {
          return s.get('channel', key);
        }).map(function (s) {
          // convert to subCallback objects
          var subscr = ridToSubscr.get(s.get('rid'), (0, _immutable.Map)());
          return (0, _immutable.Map)({
            callback: subscr.get('callback'),
            key: _immutable.OrderedSet.of(s.get('rid'), subscr.get('subChannel'), tenant)
          });
        }));
        return tiipMsg;
      });
    }
  }, {
    key: 'unsub',
    value: function unsub(channel, subChannel, tenant, args) {
      var _this5 = this;

      var secondaryKey = _immutable.OrderedSet.of(channel, subChannel, tenant);
      var fullChannel = void 0;
      this.subCallbacks.some(function (obj, key) {
        if (secondaryKey.equals(obj.get('key'))) {
          fullChannel = key;
          _this5.subCallbacks = _this5.subCallbacks.delete(channel);
          return true; // exit loop
        }
        return false;
      }, this);
      if (fullChannel) {
        return this.send('unsub', undefined, undefined, args, undefined, undefined, undefined, fullChannel);
      }
      return Promise.resolve();
    }
  }, {
    key: 'pub',
    value: function pub(payload, channel, subChannel, signal, source, tenant, args) {
      var argumentz = (0, _immutable.Map)({ subChannel: subChannel });
      if (args) argumentz = args.merge(argumentz);
      return this.send('pub', undefined, signal, argumentz, payload, tenant, source, channel);
    }
  }, {
    key: 'send',
    value: function send(type, target, signal, args, payload, tenant, source, channel) {
      var tiipMsg = tiip.pack(type, target, signal, _immutable.Iterable.isIterable(args) ? args.toJS() : args, _immutable.Iterable.isIterable(payload) ? payload.toJS() : payload, undefined, tenant, _immutable.Iterable.isIterable(source) ? source.toJS() : source, channel);
      return this.sendRaw(tiipMsg);
    }
  }, {
    key: 'sendObj',
    value: function sendObj(msgObj) {
      return this.sendRaw(tiip.packObj(msgObj));
    }
  }, {
    key: 'sendRaw',
    value: function sendRaw(text) {
      var _this6 = this;

      console.log('TiipSocket:sendRaw:', text);
      // console.log('Sending: ', text);//Commented out: Use callbacks from app to get debug printing
      return this.oSocket.up(text).then(function () {
        console.log('TiipSocket:send Succeeded!');
        if (_this6.sendCallback) _this6.sendCallback(text);
        return text;
      }).catch(function (reason) {
        if (_this6.sendFailCallback) _this6.sendFailCallback(reason);
        throw new Error(reason);
      });
    }
  }, {
    key: 'request',
    value: function request(type, target, signal, args, payload, tenant, source, channel) {
      var msg = { type: type };
      if (target !== undefined) msg.target = target;
      if (signal !== undefined) msg.signal = signal;
      if (args !== undefined) msg.arguments = _immutable.Iterable.isIterable(args) ? args.toJS() : args;
      if (payload !== undefined) {
        msg.payload = _immutable.Iterable.isIterable(payload) ? payload.toJS() : payload;
      }
      if (tenant !== undefined) msg.tenant = tenant;
      if (source !== undefined) msg.source = _immutable.Iterable.isIterable(source) ? source.toJS() : source;
      if (channel !== undefined) msg.channel = channel;
      return this.requestObj(msg);
    }
  }, {
    key: 'requestObj',
    value: function requestObj(msgObj) {
      var _this7 = this;

      var callbackId = this.newCallbackId();
      var msgObjToSend = msgObj;
      msgObjToSend.mid = callbackId;

      return new Promise(function (resolve, reject) {
        _this7.sendObj(msgObjToSend).then(function () {
          _this7.reqCallbacks = _this7.reqCallbacks.set(callbackId, (0, _immutable.fromJS)({
            time: new Date(),
            resolve: resolve,
            reject: reject,
            timeoutPromise: setTimeout(function () {
              if (_this7.reqCallbacks.has(callbackId)) {
                _this7.reqCallbacks = _this7.reqCallbacks.delete(callbackId);
                reject(new Error(timeoutErrorMessage));
              }
            }, _this7.timeoutOnRequests)
          }));
        }).catch(function (reason) {
          return reject(new Error(reason));
        }); // reject the outer promise
      });
    }

    // ------ PRIVATE METHODS ------ //

  }, {
    key: 'newCallbackId',
    value: function newCallbackId() {
      this.currentCallbackId += 1;
      if (this.currentCallbackId > midMax) {
        this.currentCallbackId = 0;
      }
      return String(this.currentCallbackId);
    }
  }]);

  return TiipSocket;
}();
'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

require('babel-polyfill');

var _tiipSocket = require('./tiip-socket');

var _crypto = require('crypto');

var _crypto2 = _interopRequireDefault(_crypto);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

// import Promise from 'bluebird';

var globalVar = typeof global !== 'undefined' // eslint-disable-line
? global : typeof window !== 'undefined' ? window : {};

function hashify(phrase) {
  return _crypto2.default.createHash('sha256').update(phrase).digest('hex');
}

var TiipSession = function () {

  // ==============================================================================================
  //  SETUP

  function TiipSession(url) {
    var _this = this;

    var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

    _classCallCheck(this, TiipSession);

    this.init = function () {
      console.log('TiipSession:init');
      if (_this.authenticated) return Promise.resolve();
      if (globalVar.localStorage) {
        var authObj = JSON.parse(globalVar.localStorage.getItem('authObj'));
        console.log('Cached credentials: ', authObj);
        if (authObj) {
          return _this.cachedInit(authObj);
        }
      }
      return Promise.reject(new Error('No cached credentials'));
    };

    this.handleInitReply = function (msgObj, reqInitObj) {
      console.log('TiipSession:handleInitReply');
      _this.authenticated = true;
      _this.authObj = reqInitObj;
      _this.authObj.rid = msgObj.getIn(['payload', 0]); // assume record id first in payload
      if (globalVar.localStorage) {
        globalVar.localStorage.setItem('authObj', JSON.stringify(_this.authObj));
      }
      // this.socket.ws.reconnectIfNotNormalClose = true;
    };

    this.onClose = function () {
      console.log('TiipSession:onClose');
      // this.hasBeenConnected = true;
      _this.authenticated = false;
      if (!_this.manualClose) {
        _this.socket.connect();
        _this.init();
      }
    };

    this.authenticated = false;
    // this.hasBeenConnected = false;
    this.authObj = undefined;
    this.setOptions(options);

    this.socket = new _tiipSocket.TiipSocket(url, _extends({}, options, { onClose: this.onClose }));
  }

  _createClass(TiipSession, [{
    key: 'connect',
    value: function connect(url) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      this.setOptions(options);
      return this.socket.connect(url, options);
    }
  }, {
    key: 'setOptions',
    value: function setOptions(options) {
      this.manualClose = false;
      if (options.onRelogin) this.reloginCallback = options.onRelogin;
      if (options.onReloginFail) this.reloginFailCallback = options.onReloginFail;
    }

    // ==============================================================================================
    //  INTERFACE IMPLEMENTATION

  }, {
    key: 'isOpen',
    value: function isOpen() {
      return this.socket.isOpen() && this.authenticated;
    }
  }, {
    key: 'auth',
    value: function auth(userId, password, tenant, target, signal, args) {
      var _this2 = this;

      console.log('TiipSession:auth');
      if (this.authenticated) return Promise.resolve();
      var passwordHash = hashify(password);
      var reqInitObj = { userId: userId, passwordHash: passwordHash, tenant: tenant, target: target, signal: signal, args: args };
      return this.socket.init(userId, passwordHash, tenant, target, signal, args).then(function (msgObj) {
        console.log('Login reply: ', msgObj.toJS());
        _this2.handleInitReply(msgObj, reqInitObj);
        return msgObj;
      });
    }
  }, {
    key: 'logout',
    value: function logout() {
      this.manualClose = true;
      this.authenticated = false;
      this.authObj = undefined;
      if (globalVar.localStorage) {
        globalVar.localStorage.removeItem('authObj');
      }
      return this.socket.kill(true);
    }

    // ==============================================================================================
    //  PRIVATE METHODS

  }, {
    key: 'cachedInit',
    value: function cachedInit(authObj) {
      var _this3 = this;

      console.log('TiipSession:cachedInit');
      return this.socket.init(authObj.userId, authObj.passwordHash, authObj.tenant, authObj.target, authObj.signal, authObj.args).then(function (msgObj) {
        _this3.authenticated = true;
        // console.log('Re-login attempt was successful');
        if (_this3.reloginCallback) _this3.reloginCallback(msgObj);
        // this.socket.ws.reconnectIfNotNormalClose = true;
        return msgObj;
      }).catch(function (reason) {
        // console.log('Re-login attempt failed: ', reason);
        if (_this3.reloginFailCallback) _this3.reloginFailCallback(reason);
        throw new Error(reason);
      });
    }

    // onOpen = () => {
    //   if (this.hasBeenConnected && this.authObj) { // Need to relogin?
    //     this.cachedInit(this.authObj);
    //   }
    // }

  }]);

  return TiipSession;
}();

exports.default = TiipSession;
