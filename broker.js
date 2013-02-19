var io = require('socket.io').listen(3000, {
	'log level': 3
});

function mkguid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  }).toUpperCase();
};

var peers = {};
var hosts = {};

var E = {
		OK: 'ok'
	, NOROUTE: 'no such route'
	, ISNOTHOST: 'peer is not a host'
};

function Peer(socket) {
	this.socket = socket;
	this.host = null;
};

function Host(options) {
	this.url = options['url'];
	this.listed = (undefined !== options['listed']) ? options['listed'] : false;
	this.metadata = options['metadata'] || {};
	this.ctime = Date.now();
};

var PEER = io.of('/peer').on('connection', function(socket) {
	var route = mkguid();
	var peer = new Peer(socket);

	socket.emit('route', route);

	socket.on('disconnect', function() {
		delete hosts[route];
		delete peers[route];
	});

	socket.on('send', function(message, callback) {
		var to = message['to'];

		if(!peers.hasOwnProperty(to)) {
			callback({'error': E.NOROUTE});
			return;
		}

		var from = route;
		var data = message['data'];
		peers[to]['socket'].emit('receive', {
			'from': from,
			'data': data
		});
	});

	socket.on('listen', function(options, callback) {
		if(peer.host)
			delete peer['host'];
		peer['host'] = new Host(options);

		callback();
	});

	socket.on('ignore', function(message, callback) {
		console.log('ignore');
		if(!peer.host) {
			callback({'error': E.ISNOTHOST});
			return;
		}

		delete hosts[route];
		delete peers['host'];

		callback();
	});

	peers[route] = peer;
});

var LIST = io.of('/list').on('connection', function(socket) {

});