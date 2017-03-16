import 'babel-polyfill';
import { TiipSocket } from './tiip-socket';
import crypto from 'crypto';
// import Promise from 'bluebird';

const globalVar = typeof global !== 'undefined' // eslint-disable-line
  ? global
  : typeof window !== 'undefined' ? window : {};

function hashify(phrase) {
  return crypto.createHash('sha256').update(phrase).digest('hex');
}

export default class TiipSession {
  // ==============================================================================================
  //  SETUP

  constructor(url, options = {}) {
    this.authenticated = false;
    this.authObj = undefined;
    this.setOptions(options);

    this.socket = new TiipSocket(url, { ...options, onClose: this.onClose });
  }

  connect(url, options = {}) {
    if (this.authenticated) return undefined;
    this.setOptions(options);
    this.socket.connect(url, options);
    return this;
  }

  setOptions(options) {
    this.manualClose = false;
    if (options.onRelogin) this.reloginCallback = options.onRelogin;
    if (options.onReloginFail) this.reloginFailCallback = options.onReloginFail;
  }

  // ==============================================================================================
  //  INTERFACE IMPLEMENTATION

  isOpen() {
    return this.authenticated;
  }

  isClosed() {
    return !this.authenticated;
  }

  init = () => {
    console.log('TiipSession:init');
    if (this.authenticated) return Promise.resolve();
    if (globalVar.localStorage) {
      const authObj = JSON.parse(globalVar.localStorage.getItem('authObj'));
      console.log('Cached credentials: ', authObj);
      if (authObj) {
        return this.cachedInit(authObj);
      }
    }
    return Promise.reject(new Error('No cached credentials'));
  };

  auth(userId, password, tenant, target, signal, args) {
    console.log('TiipSession:auth');
    if (this.authenticated) return Promise.resolve();
    const passwordHash = hashify(password);
    const reqInitObj = { userId, passwordHash, tenant, target, signal, args };
    return this.socket.init(userId, passwordHash, tenant, target, signal, args).then(msgObj => {
      console.log('Login reply: ', msgObj.toJS());
      this.handleInitReply(msgObj, reqInitObj);
      return msgObj;
    });
  }

  logout() {
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

  handleInitReply = (msgObj, reqInitObj) => {
    console.log('TiipSession:handleInitReply');
    this.authenticated = true;
    this.authObj = reqInitObj;
    this.authObj.rid = msgObj.getIn(['payload', 0]); // assume record id first in payload
    if (globalVar.localStorage) {
      globalVar.localStorage.setItem('authObj', JSON.stringify(this.authObj));
    }
  };

  cachedInit(authObj) {
    console.log('TiipSession:cachedInit');
    return this.socket
      .init(
        authObj.userId,
        authObj.passwordHash,
        authObj.tenant,
        authObj.target,
        authObj.signal,
        authObj.args,
      )
      .then(msgObj => {
        this.authenticated = true;
        if (this.reloginCallback) this.reloginCallback(msgObj);
        return msgObj;
      })
      .catch(reason => {
        if (this.reloginFailCallback) this.reloginFailCallback(reason);
        throw new Error(reason);
      });
  }

  onClose = () => {
    console.log('TiipSession:onClose');
    // this.hasBeenConnected = true;
    this.authenticated = false;
    if (!this.manualClose) {
      this.socket.connect();
      this.init();
    }
  };
}
