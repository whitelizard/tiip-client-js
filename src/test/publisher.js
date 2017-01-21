import Session from '../tiip-session';
import { w3cwebsocket } from 'websocket';

const session = new Session('ws://iim2m.com/wsh', undefined, {
  customWsClient: w3cwebsocket,
});

session.auth('webdip@example.com', 'fourwordsalluppercase', 'websensordemo')
  .then(() => session.socket.pub(['123'], '#17:0', undefined, 'online'));
