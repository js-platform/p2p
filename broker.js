var io = require('socket.io').listen(8080, {
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
	this.mtime = Date.now();
};
Host.prototype.update = function update(options) {
	this.url = options['url'];
	this.listed = (undefined !== options['listed']) ? options['listed'] : false;
	this.metadata = options['metadata'] || {};
	this.mtime = Date.now();
};

io.of('/peer').on('connection', function(socket) {
	var route = socket['id'];
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
		peers[to].emit('receive', {
			'from': from,
			'data': data
		});
	});

	socket.on('listen', function(options, callback) {
		if(hosts.hasOwnProperty(route)) {
			hosts[route].update(options);
		} else {
			hosts[route] = new Host(options);
		}

		callback();
	});

	socket.on('ignore', function(message, callback) {
		if(!hosts.hasOwnProperty(route)) {
			callback({'error': E.ISNOTHOST});
			return;
		}

		delete hosts[route];

		callback();
	});

	peers[route] = socket;
});

function Filter(options) {
	this.options = options;
};
Filter.prototype.test = function test(host) {

};

var lists = {};

io.of('/list').on('connection', function(socket) {
	var id = socket['id'];

	socket.on('disconnect', function() {
		delete lists[id];
	});

	socket.on('list', function(options) {
		lists[id] = new Filter(options);

		var result = [];

		var hostIds = Object.keys(hosts);
		hostIds.forEach
	});
});