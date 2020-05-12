import * as R from 'ramda';
import Tiip from 'jstiip';
import { encaseP, node, encase } from "fluture";

const emptyObj = Object.freeze(Object.create(null));

const sendF = client => encase(str => client.send(str));

const login = async (
  serverAddress,
  credentials = emptyObj,
  { onConnectionError } = emptyObj,
) => {
  const client = new Websocket(serverAddress);
  if (onConnectionError) client.addEventListener('error', onConnectionError);
  await client.send(new Tiip(credentials));
  return client;
};

/**
 * Publishes a message through the backend.
 * @func
 * @static
 * @param {string} channel The channel to publish on.
 * @param {Array} pl The payload to send.
 * @param {string} sig The signal data to apply to the published message.
 */
const pub = (client, channel, pl, sig) => {
  // if (!channel || typeof channel !== 'string') return undefined;
  const plOk = pl === undefined || Array.isArray(pl);
  const msg = new Tiip({ pl: plOk ? pl : [pl], sig });
  return client.event.emit(channel, msg.toJS());
};

export const createClient = () => {
  /* eslint-disable fp/no-let, fp/no-mutation */
  let rawClient;
  return {
    login: async (...args) => (rawClient = await login(...args)),
    /* eslint-enable fp/no-let, fp/no-mutation */
    close: () => rawClient.off() || rawClient.close(),
    provide: (...args) => rawClient.rpc.provide(...args),
    unprovide: (...args) => rawClient.rpc.unprovide(...args),
    // rpc: R.curry((id, args) => rawClient.rpc.make(id, args)), // TODO: USE for dsv5
    rpc: R.curry((id, args) => rawClient.rpc.p.make(id, args)),
    pub: (...args) => pub(rawClient, ...args),
    pubChannel: (channelRid, ...args) => pub(rawClient, ridToBusChannel(channelRid), ...args),
    sub: (...args) => {
      rawClient.event.subscribe(...args);
      return () => rawClient.event.unsubscribe(...args);
    },
    subChannel: (channelRid, ...args) => {
      rawClient.event.subscribe(ridToBusChannel(channelRid), ...args);
      return () => rawClient.event.unsubscribe(ridToBusChannel(channelRid), ...args);
    },
    subPresence: (clientId, ...args) => {
      rawClient.event.subscribe(ridToPresenceChannel(clientId), ...args);
      return () => rawClient.event.unsubscribe(ridToPresenceChannel(clientId), ...args);
    },
    unsub: (...args) => rawClient.event.unsubscribe(...args),
    unsubChannel: (channelRid, ...args) =>
      rawClient.event.unsubscribe(ridToBusChannel(channelRid), ...args),
    unsubPresence: (clientId, ...args) =>
      rawClient.event.unsubscribe(ridToPresenceChannel(clientId), ...args),
  };
};
