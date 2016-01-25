var crypto = require('crypto');
var fs = require('fs');
var WebSocketServer = require('ws').Server;

var port = process.env.PORT || 8080;
var wss = new WebSocketServer({ port: port });
console.info('listening on port', port);

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
	this.route = options['route'];
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

function emit(ws, type, data) {
  ws.send(JSON.stringify({type: type, data: data}));
}

wss.on('connection', function connection(ws) {
  var route = crypto.createHash('md5').update(crypto.randomBytes(64)).digest('hex');
  emit(ws, 'route', route);

  ws.on('close', function() {
    if(hosts[route]) {
      var host = hosts[route];
      changeList('remove', host);
    }
    delete hosts[route];
    delete peers[route];
  });

  function onsend(message) {
    var to = message['to'];

    if(!peers.hasOwnProperty(to)) {
      emit(ws, 'send_response', {'error': E.NOROUTE});
      return;
    }

    var from = route;
    var data = message['data'];
    emit(peers[to], 'receive', {
      'from': from,
      'data': data
    });
  }

  function onlisten(options) {
    options['route'] = route;
    if(hosts.hasOwnProperty(route)) {
      hosts[route].update(options);
      changeList('update', hosts[route]);
    } else {
      hosts[route] = new Host(options);
      changeList('append', hosts[route]);
    }

    emit(ws, 'listen_response', null);
  }

  function onignore(message) {
    if(!hosts.hasOwnProperty(route)) {
      emit(ws, 'ignore_response', {'error': E.ISNOTHOST});
      return;
    }

    var host = hosts[route];
    delete hosts[route];

    changeList('remove', host);

    emit(ws, 'ignore_response', null);
  }

  ws.on('message', function incoming(message) {
    var data = JSON.parse(message);
    if (data.type == 'send') {
      onsend(data.data);
    } else if (data.type == 'listen') {
      onlisten(data.data);
    } else if (data.type == 'ignore') {
      onignore(data.data);
    }
  });

  peers[route] = ws;
});

function Filter(socket, options) {
	this.options = options || {};
	this.socket = socket;
};
Filter.prototype.test = function test(host) {
	var filter = this.options;
	var result;

	if(filter['url'] && typeof host['url'] === 'string') {
		try {
			result = host['url'].match(filter['url']);
			if(!result)
				return true;
		} catch(e) {
			return true;
		}
	}

	if(filter['metadata'] && host['metadata']) {
		var metadataFilter = filter['metadata'];
		var metadataHost = host['metadata'];

		if(metadataFilter['name'] && typeof metadataHost['name'] === 'string') {
			try {
				result = metadataHost['name'].match(metadataFilter['name']);
				if(!result)
					return true;
			} catch(e) {
				return true;
			}
		}
	}

	return false;
};

var lists = {};

function changeList(operation, host) {
	var clients = Object.keys(lists);
	clients.forEach(function(client) {
		var filter = lists[client];
		if(!host['listed'])
			return;
		if(!filter.test(host)) {
			var data = operation === 'remove' ? host['route'] : host;
			emit(filter.socket, operation, data);
		}
	});
};
/*
io.of('/list').on('connection', function(socket) {
	var id = socket['id'];

	socket.on('disconnect', function() {
		delete lists[id];
	});

	socket.on('list', function(options) {
		var filter = new Filter(socket, options);

		var result = [];

		var hostIds = Object.keys(hosts);
		hostIds.forEach(function(hostId) {
			var host = hosts[hostId];
			if(!host['listed'])
				return;
			if(!filter.test(host))
				result.push(host);
		});

		lists[id] = filter;

		socket.emit('truncate', result);
	});
});
*/
