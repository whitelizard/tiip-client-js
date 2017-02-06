import Promise from 'bluebird';
import { List } from 'immutable';

// const reconnectableStatus = 4000;
const timeoutStart = 300;
const timeoutMax = 2 * 60 * 1000;
export const readyStates = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
  RECONNECT_ABORTED: 4,
};

const globalVar = typeof global !== 'undefined' // eslint-disable-line
  ? global
  : (typeof window !== 'undefined' ? window : {});

function createWebSocket(url, protocols, customWsClient) {
  const urlOk = /wss?:\/\//.exec(url);
  if (!urlOk) {
    throw new Error('Invalid url provided');
  }
  const Socket = customWsClient || globalVar.WebSocket || globalVar.MozWebSocket;
  return new Socket(url, protocols || undefined);
}

export default class WsClient {

  constructor(url, protocols, options = {}) {
    this.init(url, protocols, options);
    // this.reconnectAttempts = 0;
    this.connecting = false;
    this.manualClose = false;
    this.resolveConnecting = List();
    this.rejectConnecting = List();
    this.sendQueue = List();
    // this.onOpenCallbacks = List();
    this.onCloseCallbacks = List();
    this.onErrorCallbacks = List();
    this.onMessageCallbacks = List();
    this.socket = undefined;
  }

  // ==============================================================================================
  //  PUBLIC

  // connectedCheck(resolve, reject, count) {
  //   if (this.isOpen()) return resolve();
  //   if (count > 20 * 30) return reject(new Error('Could not connect socket'));
  //   return setTimeout(this.connectedCheck.bind(resolve, reject, ++count), 50);
  // }

  connect = (url, protocols, options = {}) => {
    console.log('WsClient:connect');
    this.init(url, protocols, options);
    const connectingState = this.socket && (this.socket.readyState === readyStates.CONNECTING);
    return new Promise((resolve, reject) => {
      if (this.isOpen()) {
        resolve();
      } else {
        if (!connectingState && !this.connecting) {
          console.log('Will createWebSocket...');
          this.connecting = true;
          this.socket = createWebSocket(this.url, this.protocols, this.customWsClient);
          this.socket.onmessage = this.onMessageHandler;
          this.socket.onopen = this.onOpenHandler;
          this.socket.onerror = this.onErrorHandler;
          this.socket.onclose = this.onCloseHandler;
        }
        this.resolveConnecting = this.resolveConnecting.push(resolve);
        this.rejectConnecting = this.rejectConnecting.push(reject);
      }
    });
  }

  // connect = (url, protocols, options = {}) => {
  //   if (this.connecting) throw new Error('Socket is in open or connecting state');
  //   this.connecting = true;
  //   this.init(url, protocols, options);
  //   console.log('WsClient:connect readyState:', this.socket && this.socket.readyState);
  //   const connectingState = this.socket && (this.socket.readyState === readyStates.CONNECTING);
  //   if (!this.isOpen() && !connectingState) {
  //     console.log('WsClient:connect Will connect a socket...');
  //     // this.terminate();
  //     this.socket = createWebSocket(this.url, this.protocols, this.customWsClient);
  //     this.socket.onmessage = this.onMessageHandler;
  //     this.socket.onopen = this.onOpenHandler;
  //     this.socket.onerror = this.onErrorHandler;
  //     this.socket.onclose = this.onCloseHandler;
  //   }
  //   return this;
  // }

  isOpen() {
    return this.socket && this.socket.readyState === readyStates.OPEN;
  }

  init(url, protocols, options = {}) {
    if (url) {
      this.url = url;
      this.isEncrypted = /^(wss:)/i.test(this.url);
    }
    if (protocols) this.protocols = protocols;

    if (options.timeoutStart) this.timeoutStart = options.timeoutStart;
    else if (!this.timeoutStart) this.timeoutStart = timeoutStart;

    if (options.timeoutMax) this.timeoutMax = options.timeoutMax;
    else if (!this.timeoutMax) this.timeoutMax = timeoutMax;

    if (options.reconnectIfNotNormalClose) {
      this.reconnectIfNotNormalClose = options.reconnectIfNotNormalClose;
    }

    if (options.customWsClient) this.customWsClient = options.customWsClient;
    return this;
  }

  // onOpen(cb) {
  //   this.onOpenCallbacks = this.onOpenCallbacks.push(cb);
  //   return this;
  // }

  onClose(cb) {
    this.onCloseCallbacks = this.onCloseCallbacks.push(cb);
    return this;
  }

  onError(cb) {
    this.onErrorCallbacks = this.onErrorCallbacks.push(cb);
    return this;
  }

  onMessage(cb) {
    this.onMessageCallbacks = this.onMessageCallbacks.push(cb);
    return this;
  }

  clearCallbacks() {
    // this.onOpenCallbacks = this.onOpenCallbacks.clear();
    this.onCloseCallbacks = this.onCloseCallbacks.clear();
    this.onErrorCallbacks = this.onErrorCallbacks.clear();
    this.onMessageCallbacks = this.onMessageCallbacks.clear();
    return this;
  }

  send(message) {
    const connectingState = this.socket && (this.socket.readyState === readyStates.CONNECTING);
    return new Promise((resolve, reject) => {
      if (this.isOpen() || connectingState || this.connecting) {
        this.sendQueue = this.sendQueue.push({ message, resolve });
        this.fireQueue();
      } else {
        reject(new Error('Could not send: Socket closed'));
      }
    });
  }

  close() {
    this.manualClose = true;
    if (this.socket) this.socket.close();
  }

  // reconnect() {
  //   this.terminate();
  //   const backoffDelay = this.getBackoffDelay(++this.reconnectAttempts);
  //   const backoffDelaySeconds = backoffDelay / 1000;
  //   console.log(`Reconnecting in ${backoffDelaySeconds} seconds`);
  //   // this.reconnectTimer = setTimeout(this.connect, backoffDelay);
  //   return this.connect();
  // }

  // ==============================================================================================

  fireQueue() {
    while (this.sendQueue.size && this.isOpen()) {
      const data = this.sendQueue.first();
      this.sendQueue = this.sendQueue.shift();
      this.socket.send(data.message);
      data.resolve();
    }
    return this;
  }

  // ==============================================================================================
  //  PRIVATE

  onOpenHandler = (event) => {
    console.log('WsClient:onOpenHandler');
    // this.reconnectAttempts = 0;
    this.manualClose = false;
    this.connecting = false;
    if (!this.resolveConnecting.isEmpty()) {
      this.resolveConnecting.forEach(resolve => resolve(event));
      this.resolveConnecting = this.resolveConnecting.clear();
    }
    // this.onOpenCallbacks.forEach(cb => cb(event));
    this.fireQueue();
  }

  onCloseHandler = (event) => {
    console.log('WsClient:onCloseHandler:', event);
    this.socket = undefined;
    this.connecting = false;
    if (!this.rejectConnecting.isEmpty()) {
      this.rejectConnecting.forEach(reject => reject(new Error('Socket was closed')));
      this.rejectConnecting = this.rejectConnecting.clear();
    }
    this.onCloseCallbacks.forEach(cb => cb(event));
    // const notNormalReconnect = this.reconnectIfNotNormalClose && !this.manualClose;
    // if (notNormalReconnect && event.code === reconnectableStatus) {
    //   this.reconnect();
    // }
  }

  onErrorHandler = (event) => {
    console.log('WsClient:onErrorHandler');
    this.connecting = false;
    if (!this.rejectConnecting.isEmpty()) {
      this.rejectConnecting.forEach(reject => reject(new Error('Error on socket')));
      this.rejectConnecting = this.rejectConnecting.clear();
    }
    this.onErrorCallbacks.forEach(cb => cb(event));
  }

  onMessageHandler = (message) => {
    this.onMessageCallbacks.forEach(cb => cb(message));
  }

  // getBackoffDelay(attempt) {
  //   // Exponential Backoff Formula by Prof. Douglas Thain
  //   // http://dthain.blogspot.co.uk/2009/02/exponential-backoff-in-distributed.html
  //   return Math.floor(Math.min(
  //     (Math.random() + 1) * this.timeoutStart * Math.pow(2, attempt),
  //     this.timeoutMax
  //   ));
  // }
}
