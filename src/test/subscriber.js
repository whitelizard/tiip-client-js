import Session from '../tiip-session';
import { w3cwebsocket } from 'websocket';

const session = new Session('ws://iim2m.com/wsh', undefined, {
  customWsClient: w3cwebsocket,
});

function gotData(msgObj) {
  console.log('Got: ', msgObj.toJS());
}

session.auth('demo@example.com', 'demo', 'websensordemo')
  .then(() => session.socket.sub(gotData, '#17:0'));
