# WebRTC Peer

This library provides a simple interface for creating and managing WebRTC peer connections.

## API

### Peer

A peer provides methods and callbacks for interacting with a broker and opening peer connections.

````javascript
var peer = new Peer('http://my.broker.url');
````

A peer will invoke `onready` when it can handle other operations. It will also invoke `onnotready` when the peer is not ready to connect or host.

````javascript
peer.onready = function() {
	...
};
peer.onnotready = function() {

};
````

Once the peer is ready, you can call `connect()` or `host()`.

````javascript
peer.onhost = function(session) {
	...
};
peer.host({...});
````