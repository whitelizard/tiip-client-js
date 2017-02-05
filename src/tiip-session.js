import { TiipSocket } from './tiip-socket';
import crypto from 'crypto';
import Promise from 'bluebird';

const globalVar = typeof global !== 'undefined' // eslint-disable-line
  ? global
  : (typeof window !== 'undefined' ? window : {});

function hashify(phrase) {
  return crypto.createHash('sha256').update(phrase).digest('hex');
}

export default class TiipSession {

  // ==============================================================================================
  //  SETUP

  constructor(url, protocols, options = {}) {
    this.authenticated = false;
    this.hasBeenConnected = false;
    this.authObj = undefined;
    this.user = undefined;

    this.socket = new TiipSocket(url, protocols, options);
    this.socket.ws.onClose(this.onClose);
    // this.socket.ws.onOpen(this.onOpen);

    // if (url) {
    //   this.connect(url, protocols, options);
    // } else {
    this.setOptions(options);
    // }
  }

  connect(url, protocols, options = {}) {
    this.setOptions(options);
    return this.socket.connect(url, protocols, options);
  }

  setOptions(options) {
    if (options.onRelogin) this.reloginCallback = options.onRelogin;
    if (options.onReloginFail) this.reloginFailCallback = options.onReloginFail;
  }

  // ==============================================================================================
  //  INTERFACE IMPLEMENTATION

  isOpen() {
    return this.socket.isOpen() && this.authenticated;
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
  }

  auth(userId, password, tenant, target, signal, args) {
    console.log('TiipSession:auth');
    if (this.authenticated) return Promise.resolve();
    const passwordHash = hashify(password);
    const reqInitObj = { userId, passwordHash, tenant, target, signal, args };
    return this.socket.init(userId, passwordHash, tenant, target, signal, args)
      .then(msgObj => {
        console.log('Login reply: ', msgObj.toJS());
        this.handleInitReply(msgObj, reqInitObj);
        return msgObj;
      });
  }

  logout() {
    this.user = undefined;
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
    // this.socket.ws.reconnectIfNotNormalClose = true;
  }

  cachedInit(authObj) {
    console.log('TiipSession:cachedInit');
    return this.socket.init(
      authObj.userId,
      authObj.passwordHash,
      authObj.tenant,
      authObj.target,
      authObj.signal,
      authObj.args,
    )
      .then(msgObj => {
        this.authenticated = true;
        // console.log('Re-login attempt was successful');
        if (this.reloginCallback) this.reloginCallback(msgObj);
        // this.socket.ws.reconnectIfNotNormalClose = true;
        return msgObj;
      })
      .catch(reason => {
        // console.log('Re-login attempt failed: ', reason);
        if (this.reloginFailCallback) this.reloginFailCallback(reason);
        throw new Error(reason);
      });
  }

  // onOpen = () => {
  //   if (this.hasBeenConnected && this.authObj) { // Need to relogin?
  //     this.cachedInit(this.authObj);
  //   }
  // }

  onClose = () => {
    console.log('TiipSession:onClose');
    this.hasBeenConnected = true;
    this.authenticated = false;
    if (!this.socket.ws.manualClose) {
      this.socket.connect().then(this.init);
    }
  }
}
