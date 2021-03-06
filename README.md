# tiip-client-js
Websocket based JS client using protocol [tiip](https://github.com/whitelizard/tiip). Contains patterns *req/rep* and *pub/sub*.

```
npm i -S tiip-client-js
```

The **socket** object contains the patterns/calls. The **session** object is the authentication layer on top of the socket. A *session* object always has a *socket* object inside (Note how the different calls look below).

Example of setup and use of the `session` object:
```javascript
import TiipSession from 'tiip-client-js';

const session = new TiipSession();

session.connect('wss://echo.websocket.org'); // This URL will of course not work since it is not a service using tiip, it's just an example URL

// Try to init with cached credentials
session.init(); // returns promise

// In other case, login with user credentials
session.auth(userId, passphrase); // returns promise

// Test if we are connected and authenticated
if (session.isOpen()) ...

session.logout()
```

Examples of `session.socket` calls:
```javascript
// session object setup as above

// all these calls are of course depending on server API
session.socket.req('main', 'readProfile');
session.socket.req('main', 'readUser', {descending: false});
session.socket.req('weather', 'readWeatherData', {lat: 58.554, lon: 16.713});
session.socket.sub(msg => console.log(msg.toJS()), '#77:3'); // msg will be delivered as an immutablejs map
```


### ```TiipSession([url, options])```
Constructor of a TiipSession object.
Returns a TiipSession (with `new`).
-	**url:** Full address of websocket endpoint.
- **options:** Option object with the following possible key/values:
  - onRelogin: Callback function that is called when a re-login happens.
  - onReloginFail: Callback function called if a re-login fails.
  - customWsClient: A websocket class to use instead of the built-in.
  - onSend: Callback function invoked whenever something is sent on the socket.
  - onReceive: Callback function called when a message is received.
  - onError: Callback function invoked in case of error on the socket.
  - onClose: Callback function called when the socket closes.
  - timeoutOnRequests: Number of milliseconds to use as request timeout (default 30 seconds).

### ```session.connect([url, options]);```
Connect the socket, using *url* and *options* set via the constructor, or new ones passed here.
Returns the session object (to enable chaining).
-	**url:** Full address of websocket endpoint.
- **options:** See description above, for the constructor.

### ```session.init();```
Authenticate with possible cached credentials, otherwise rejects.
Returns a promise that resolves on a successful response from the server.

### ```session.auth(userId, passphrase, [tenant, target, signal, args]);```
Authenticate (sends a tiip init type message).
Returns a promise that resolves on a successful response from the server.
-	**userId:** Id for the identity attempting to login.
-	**passphrase:** The passphrase for the identity above.
-	**tenant:** The tenant to login to (optional).
-	**target:** The target controller (optional).
-	**signal:** Possible use of signal, depends on server API.
-	**args:** Possible use of arguments, depends on server API.

### ```session.socket.req(target, signal, [args, tenant]);```
Send a request, get a reply (req/rep).
Returns a promise that resolves on a successful response from the server. The reply will be an immutablejs map.
-	**target:** The sub system or micro service that should receive the request.
-	**signal:** The specific API call or "question". Example: ‘readUser’.
-	**args:** (optional) An object with arguments for that particular API call (signal). Example: {"name": "Tom"}
-	**tenant:** Possible use of tenant, depends on server API.

### ```session.socket.sub(callback, channel, [subChannel, tenant, args]);```
Starts a subscription to a channel (pub/sub). The messages delivered to the callback will be of type immutablejs map.
Returns a promise that resolves on a successful response from the server.
-	**callback:** The callback function to run when a message arrives on the subscribed channel.
-	**channel:** The channel to subscribe to. Could be an ID of a channel object in the data model.
-	**subChannel:** Optional sub-channel within the channel.
- **tenant:** Possible use of tenant, depends on server API.
-	**args:** Possible additional arguments.

### ```session.socket.unsub(channel, [subChannel, tenant, args]);```
Ends a subscription.
Returns a promise that resolves when the message was sent successfully.
-	**channel:** Channel corresponding to an earlier sub call (see sub above).
-	**subChannel:** Sub channel corresponding to an earlier sub call (see sub above).
-	**tenant:** Tenant corresponding to an earlier sub call (see sub above).
-	**args:** Possible additional arguments.

### ```session.socket.pub(payload, channel, [subChannel, signal, source, tenant, args]);```
Publishes data on a channel.
Returns a promise that resolves when the message was sent successfully.
-	**payload:** Values to publish, as an array.
-	**channel:** Channel to publish on. Could be an ID of a channel object in the data model.
-	**subChannel:** Optional sub channel inside the channel.
-	**signal:** Optional custom signal.
-	**source:** Optional array of IDs describing the source of the data.
-	**tenant:** Possible use of tenant, depends on server API.
-	**args:** Possible additional arguments.

### ```session.logout();```
Log out the session and kill the connection. Cached credentials will be erased.
