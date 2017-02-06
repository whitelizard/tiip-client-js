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
