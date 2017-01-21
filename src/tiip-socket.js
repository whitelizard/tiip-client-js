/** @module archmage-socket
 * @description High level Socket class agains an ARCHMAGE server.
 */
import WsClient from './ws-client';
import * as tiip from 'jstiip';
import Promise from 'bluebird';
import { Map, List, Set, fromJS, Iterable, OrderedSet } from 'immutable';

const initTarget = 'TiipController';
const timeoutOnRequests = 30 * 1000;
const midMax = 10000;
const timeoutErrorMessage = 'Timeout';
const nonMetaFields = Set.of('timestamp', 'source', 'signal', 'payload', 'clientTime');

export class TiipSocket {

  /**
   * TiipSocket constructor. Does not connect.
   * @param  {object} url Websocket URL
   * @param  {string} protocols Protocols object for the browser WebSocket API
   * @param  {string} options Options object {onSend, onSendFail, onReceive, timeoutOnRequests}
   */
  constructor(url, protocols, options = {}) {
    this.currentCallbackId = 0;
    this.reqCallbacks = Map();
    this.subCallbacks = Map();
    this.setOptions(options);

    this.ws = new WsClient(url, protocols, {
      reconnectIfNotNormalClose: true,
      ...options,
    });
    this.ws.onMessage(this.onMessage);
    this.ws.onClose(this.clearCallbacks);
  }

  /**
   * Connect the socket. Will handle same arguments as the constructor.
   * @param  {object} url Websocket URL
   * @param  {string} protocols Protocols object for the browser WebSocket API
   * @param  {string} options Options object {onSend, onSendFail, onReceive, timeoutOnRequests}
   * @return {object}  The whole Socket (this)
   */
  connect(url, protocols, options = {}) {
    this.setOptions(options);
    this.ws.connect(url, protocols, {
      reconnectIfNotNormalClose: true,
      ...options,
    });
    return this;
  }

  setOptions(options) {
    if (options.onSend) this.sendCallback = options.onSend;
    if (options.onSendFail) this.sendFailCallback = options.onSendFail;
    if (options.onReceive) this.receiveCallback = options.onReceive;
    if (options.timeoutOnRequests) this.timeoutOnRequests = options.timeoutOnRequests
    else if (!this.timeoutOnRequests) this.timeoutOnRequests = timeoutOnRequests;
  }

  init(userId, passwordHash, tenant, target, signal, args) {
    let argumentz = { id: userId, password: passwordHash };
    if (args) {
      argumentz = { ...args, ...argumentz };
    }
    return this.request(
      'init', target || defaults.initTarget, signal, argumentz, undefined, tenant
    );
  }

  clearCallbacks = () => {
    this.reqCallbacks.forEach(reqObj => {
      clearTimeout(reqObj.get('timeoutPromise'));
      reqObj.get('reject')(new Error('Clearing all requests'));
    });
    this.reqCallbacks = this.reqCallbacks.clear();
    this.subCallbacks = this.subCallbacks.clear();
  }

  kill(force) {
    // this.clearCallbacks();
    return this.ws.close(force);
  }

  req(target, signal, args, tenant) {
    return this.request('req', target, signal, args, undefined, tenant);
  }

  sub(callback, channel, subChannel, tenant, args) {
    const secondaryKey = OrderedSet.of(channel, subChannel, tenant);
    let argumentz;
    if (subChannel) {
      argumentz = { subChannel };
      if (args) argumentz = { ...args, ...argumentz };
    } else if (args) {
      argumentz = args;
    }

    return this.request(
      'sub', undefined, undefined, argumentz, undefined, tenant, undefined, channel
    )
      .then(tiipMsg => {
        if (tiipMsg.has('channel')) {
          // Only support for subscription to one channel at a time
          this.subCallbacks = this.subCallbacks.set(tiipMsg.get('channel'), Map({
            callback,
            key: secondaryKey,
          }));
        }
        return tiipMsg;
      });
  }

  /**
   * (FUTURE) Subscribe to multiple channels. UNTESTED!
   * @param {object} subscriptions as List:[{ callback:<func>, rid:<rid>, subChannel:<>}]
   */
  subMulti(subscriptions, tenant, args) {
    const ridToSubscr = subscriptions.toMap().mapKeys((key, val) =>
      val.get('rid', key)
    );
    let argumentz = { subscriptions: subscriptions.map(
      s => s.delete('callback')
    ).toJS() };
    if (args) argumentz = { ...args, ...argumentz };

    return this.request('sub', undefined, undefined, argumentz, undefined, tenant, undefined)
      .then(tiipMsg => {
        this.subCallbacks = this.subCallbacks.merge(
          // payload to map on actual channels:
          tiipMsg.get('payload', List()).toMap().mapKeys((key, s) => s.get('channel', key))
            .map(s => { // convert to subCallback objects
              const subscr = ridToSubscr.get(s.get('rid'), Map());
              return Map({
                callback: subscr.get('callback'),
                key: OrderedSet.of(
                  s.get('rid'), subscr.get('subChannel'), tenant
                ),
              });
            })
        );
        return tiipMsg;
      });
  }

  unsub(channel, subChannel, tenant, args) {
    const secondaryKey = OrderedSet.of(channel, subChannel, tenant);
    let fullChannel;
    this.subCallbacks.some((obj, key) => {
      if (secondaryKey.equals(obj.get('key'))) {
        fullChannel = key;
        this.subCallbacks = this.subCallbacks.delete(channel);
        return true; // exit loop
      }
      return false;
    }, this);
    if (fullChannel) {
      return this.send('unsub',
        undefined, undefined, args, undefined, undefined, undefined, fullChannel
      );
    }
    return Promise.resolve();
  }

  pub(payload, channel, subChannel, signal, source, tenant, args) {
    let argumentz = Map({ subChannel });
    if (args) argumentz = args.merge(argumentz);
    return this.send('pub',
      undefined, signal, argumentz, payload, tenant, source, channel
    );
  }

  isOpen() {
    return this.ws.isOpen();
  }

  bufferedAmount() {
    return this.ws.socket.bufferedAmount;
  }

  send(type, target, signal, args, payload, tenant, source, channel) {
    const tiipMsg = tiip.pack(
      type, target, signal,
      Iterable.isIterable(args) ? args.toJS() : args,
      Iterable.isIterable(payload) ? payload.toJS() : payload,
      undefined, tenant,
      Iterable.isIterable(source) ? source.toJS() : source,
      channel
    );
    return this.sendRaw(tiipMsg);
  }

  sendObj(msgObj) {
    return this.sendRaw(tiip.packObj(msgObj));
  }

  sendRaw(text) {
    // console.log('Sending: ', text);//Commented out: Use callbacks from app to get debug printing
    return this.ws.send(text)
      .then(() => {
        if (this.sendCallback) this.sendCallback(text);
      })
      .catch((reason) => {
        if (this.sendFailCallback) this.sendFailCallback(reason);
        return reason;
      });
  }

  request(type, target, signal, args, payload, tenant, source, channel) {
    let msg = { type };
    if (target !== undefined) msg.target = target;
    if (signal !== undefined) msg.signal = signal;
    if (args !== undefined) msg.args = args;
    if (payload !== undefined) msg.payload = payload;
    if (tenant !== undefined) msg.tenant = tenant;
    if (source !== undefined) msg.source = source;
    if (channel !== undefined) msg.channel = channel;
    return this.requestObj(msg);
  }

  requestObj(msgObj) {
    const callbackId = this.newCallbackId();
    msgObj.mid = callbackId;

    return new Promise((resolve, reject) => {
      this.sendObj(msgObj)
        .then(() => {
          this.reqCallbacks = this.reqCallbacks.set(callbackId, fromJS({
            time: new Date(),
            resolve,
            reject,
            timeoutPromise: setTimeout(() => {
              if (this.reqCallbacks.has(callbackId)) {
                this.reqCallbacks = this.reqCallbacks.delete(callbackId);
                reject(new Error(timeoutErrorMessage));
              }
            }, this.timeoutOnRequests),
          }));
        })
        .catch(reason => reject(reason)); // reject the outer promise
    });
  }

  // ------ PRIVATE METHODS ------ //

  newCallbackId() {
    this.currentCallbackId += 1;
    if (this.currentCallbackId > midMax) {
      this.currentCallbackId = 0;
    }
    return String(this.currentCallbackId);
  }

  callSubCallback = (channel, msgObj) => {
    const callback = this.subCallbacks.getIn([channel, 'callback']);
    if (callback) {
      callback(msgObj.filter((v, field) => nonMetaFields.has(field)));
    }
  }

  onMessage = (msg) => {
    let msgObj;
    let isTiip = true;
    let errorReason = undefined;

    try {
      msgObj = fromJS(tiip.unpack(msg.data));
      // console.log('Msg received: ', msgObj);
    } catch (err) {
      isTiip = false; // non-tiip messge
      // console.log('Msg received: ', msg.data);
    }

    if (isTiip) {
      switch (msgObj.get('type')) {
        case 'rep': {
          const mid = msgObj.get('mid');
          const reqCallbackObj = this.reqCallbacks.get(mid);
          // If an object exists with msgObj.mid in reqCallbacks, resolve it
          if (mid && reqCallbackObj) {
            clearTimeout(reqCallbackObj.get('timeoutPromise'));
            if (msgObj.get('ok')) {
              reqCallbackObj.get('resolve', Function.prototype)(msgObj);
            } else {
              reqCallbackObj.get('reject', Function.prototype)(
                new Error(`Request error, or denied. ${
                  msgObj.getIn(['payload', 0], '')
                }`)
              );
              errorReason = 'Request error, or denied';
            }
            this.reqCallbacks = this.reqCallbacks.delete(mid);
          } else {
            errorReason = 'No request matched server reply';
          }
          break;
        }
        case 'pub': {
          const channel = msgObj.get('channel');
          // First, try exact matching:
          let done = this.subCallbacks.forEach((value, key) => {
            if (key === channel) {
              callSubCallback(key, msgObj);
              return false; // done
            }
            return true;
          });
          // Then, if no callback found, try subchannel matching:
          if (!done) {
            done = this.subCallbacks.forEach((value, key) => {
              if (key === channel.substring(0, key.length)) {
                callSubCallback(key, msgObj);
                return false; // done
              }
              return true;
            });
          }
          if (!done) {
            // No key found
            errorReason = 'No subscription for publication from server';
          }
          break;
        }
        default: {
          errorReason = 'Unknown message type';
        }
      }
    }
    if (this.receiveCallback) {
      if (isTiip) {
        this.receiveCallback(msgObj, errorReason, msgObj.get('type'));
      } else {
        this.receiveCallback(msg.data);
      }
    }
  }
}
