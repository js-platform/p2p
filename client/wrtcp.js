(function(define, global) { 'use strict';
define(['module'], function(module) {

	var RTCPeerConnection;
	if(!window.RTCPeerConnection) {
		if(window.mozRTCPeerConnection)
			RTCPeerConnection = window.mozRTCPeerConnection;
		else if(window.webkitRTCPeerConnection)
			RTCPeerConnection = window.webkitRTCPeerConnection;
	} else {
		RTCPeerConnection = window.RTCPeerConnection
	}
	var getUserMedia;
	if(!navigator.getUserMedia) {
		if(navigator.mozGetUserMedia)
			getUserMedia = navigator.mozGetUserMedia.bind(navigator);
		else if(navigator.webkitGetUserMedia)
			getUserMedia = navigator.webkitGetUserMedia.bind(navigator);
	} else {
		getUserMedia = navigator.getUserMedia.bind(navigator);
	}

	function callback(object, method, args) {
		if(!Array.isArray(args))
			args = [args];
    if(method in object && 'function' === typeof object[method]) {
      object[method].apply(object, args);
    }
  };

  function fail(object, method, error) {
  	if (!(error instanceof Error))
      error = new Error(error);
    callback(object, method, [error]);
  };

	var ONE_SECOND = 1000; // milliseconds
	var DEFAULT_CONNECTION_TIMEOUT = 10 * ONE_SECOND;
  var DEFAULT_PING_TIMEOUT = 1 * ONE_SECOND;
  var RELIABLE_CHANNEL_OPTIONS = {
  	// defaults are OK  	
  };
  var UNRELIABLE_CHANNEL_OPTIONS = {
    outOfOrderAllowed: true,
    maxRetransmitNum: 0
  };

/*
  function BrokerChannel(broker) {
  	var that = this;
  	this.broker = broker;
  	this.channel = null;
  	this.sid = null;
  	this.cid = null;
  	this.key = null;
  	this.connected = false;
  	this.session = false;

  	this.onconnect = null; // args: -
  	this.ondisconnect = null; // args: reason
  	this.onmessage = null; // args: to, from, message
  	this.onsessioncreated = null; // args: sid
  	this.onsessiondeleted = null; // args: -
  	this.onerror = null; // args: error

  	var channel = this.channel = new EventSource(this.broker + '/channel');
  	channel.addEventListener('error', function(event) {
      if(event.target.readyState == EventSource.CLOSED || event.target.readyState == EventSource.CONNECTING) {
        // Connection was closed.          
        console.log('broker channel closed');
        channel.close();
        that.connected = false;
        callback(that, 'ondisconnect', []);        
      } else {
      	fail(that, 'onerror', event.target.readyState);
      }
    }, false);
    channel.addEventListener('control', function(event) {
      console.log('broker control message');
      var data = JSON.parse(event.data);
      that.cid = data['cid'];
      that.key = data['key'];

      that.connected = true;
      callback(that, 'onconnect', []);
    }, false);
    channel.addEventListener('message', function(event) {
      console.log('broker application message');
      var data = JSON.parse(event.data);
      var to = data['target'];
      var from = data['origin'];
      var message = data['message'];

      callback(that, 'onmessage', [to, from, message]);
    }, false);
  };
  BrokerChannel.prototype.send = function send(to, from, message) {
  	var that = this;
  	var url = this.broker + '/send/' + to;
  	var xhr = new XMLHttpRequest();

    var request = {
      'origin': from,
      'key': that.key,
      'message': message
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = function() {
      if(4 !== xhr.readyState) return;
      if(!(200 === xhr.status || 201 === xhr.status)) {
      	fail(that, 'onerror', xhr.statusText + ': ' + xhr.responseText)        
      }
    };
    xhr.send(JSON.stringify(request));
  };
  BrokerChannel.prototype.close = function close() {
  	this.connected = false;
  	this.channel.close();
  	callback(this, 'ondisconnect', []);
  };
  BrokerChannel.prototype.createSession = function createSession(options) {
  	if(this.session)
  		throw new Error('session already exists');
  	options = options || {};
  	var that = this;
  	var url = this.broker + '/session';
    var xhr = new XMLHttpRequest();
    var request = {
      'cid': this.cid,
      'key': this.key,
      'list': options['list'],
      'metadata': options['metadata'],
      'url': options['url'] || window.location.toString(),
      'authenticate': options['authenticate'],
      'application': options['application']
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = function() {
      if(4 !== xhr.readyState) return;
      if(!(200 === xhr.status || 201 === xhr.status)) {
      	fail(that, 'onerror', xhr.statusText + ': ' + xhr.responseText)        
      }

      var response = JSON.parse(xhr.responseText);
      var sid = that.sid = response['sid'];

      that.session = true;
      callback(that, 'onsessioncreated', [sid]);
    };
    xhr.send(JSON.stringify(request));
  };
  BrokerChannel.prototype.deleteSession = function deleteSession() {
		if(!this.session)
			throw new Error('no session');
  	var that = this;
		var url = this.brokerChannel.broker + '/session/delete';
    var xhr = new XMLHttpRequest();
    var request = {
      'cid': this.brokerChannel.cid,
      'key': this.brokerChannel.key
    };

  	xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = function() {
      if(4 !== xhr.readyState) return;
      if(!(200 === xhr.status || 201 === xhr.status)) {
      	fail(that, 'onerror', xhr.statusText + ': ' + xhr.responseText)        
      }

      callback(that, 'onsessiondeleted', []);
    };
    xhr.send(JSON.stringify(request));
  };

  function WebRTCHandshake() {
  	this.complete = false;
  	this.message = null;
  	this.peerConnection = null;
  	this.oncomplete = null;
  	this.onerror = null;
  };
  WebRTCHandshake.prototype.initialize = function initialize() {
  	// create new offer
  };
  WebRTCHandshake.prototype.process = function process(message) {
  	// update handshake state
  };  

  var nextConnectionDescriptor = 1;
	function Connection(options) {
		this.connected = false;
		this.descriptor = nextConnectionDescriptor ++;

		this.reliable = null;
		this.unreliable = null;
		this.control = null;

		this.onconnect = null; // args: -
		this.ondisconnect = null; // args: reason
		this.onerror = null; // args: error
	};
	Connection.prototype.close = function close() {

	};

	function _handleBrokerChannelMessage(peer, to, from, message) {
		var handshake;
		if(!peer.pending.hasOwnProperty(from)) {
			handshake = peer.pending[from] = new WebRTCHandshake();
			handshake.oncomplete = function(connection) {
				delete peer.pending[from];
				peer.connections[connection.descriptor] = connection;
				callback(peer, 'onconnect', [connection]);
			};
			handshake.onerror = function(error) {
				delete peer.pending[from];
				callback(peer, 'onerror', [error])
			};
		} else {
			handshake = peer.pending[from];
		}
		var result = handshake.process(message);
		if(result) {
			// 'to' and 'from' are inverted because we're replying
			peer.brokerChannel.send(from, to, result);
		}
	};
	function _initBrokerChannel(peer) {
		if(peer.brokerChannel)
			return;
		var brokerChannel = new BrokerChannel(peer.broker);

		brokerChannel.onmessage = _handleBrokerChannelMessage.bind(undefined, peer);
		brokerChannel.onconnect = function() {
			callback(peer, 'onready', []);
		};

		peer.brokerChannel = brokerChannel;
	};
	function _acquireBrokerClient(peer) {
		_initBrokerChannel(peer);
		++ peer.brokerClients;
	};
	function _releaseBrokerClient(peer) {
		-- peer.brokerClients;
		if(0 === peer.brokerClients) {
			peer.brokerChannel.close();
			peer.brokerChannel = null;
		}
	};
	function Peer(broker, options) {
		var that = this;
		this.broker = broker;		
		this.options = options;
		this.connections = {};
		this.pending = {};
		this.brokerClients = 0;

		this.onready = null;
		this.onlisten = null;
		this.onignore = null;
		this.onpending = null; // args: handshake
		this.onconnect = null; // args: connection
		this.onerror = null; // args: error

		this.brokerChannel = null;
	};
	Peer.prototype.listen = function listen(options) {
		var that = this;
		_initBrokerChannel(this);

		if(this.brokerChannel.session)
			throw new Error('session already exists')
		this.brokerChannel.createSession(options)
		this.brokerChannel.onsessioncreated = function(sid) {
			// FIXME: it's more useful to return the full client URL here
			_acquireBrokerClient(that);
			callback(that, 'onlisten', [sid]);
		};
		this.brokerChannel.onsessiondeleted = function() {
			_releaseBrokerClient(that);
			callback(that, 'onignore', []);
		};
	};
	Peer.prototype.ignore = function ignore() {
		if(!this.brokerChannel.session)
			throw new Error('no session');

		this.brokerSession.close();
	};
	Peer.prototype.connect = function connect(sid, options) {
		var that = this;
		_initBrokerChannel(this);

		var handshake = this.pending[sid] = new WebRTCHandshake();
		handshake.oncomplete = function(connection) {
			delete that.pending[from];
			that.connections[connection.descriptor] = connection;
			callback(that, 'onconnect', [connection]);
		};
		handshake.onerror = function(error) {
			delete that.pending[from];
			callback(that, 'onerror', [error])
		};
		var result = handshake.initialize();
		if(result) {
			this.brokerChannel.send(sid, this.cid, result);
		}
	};
*/
	// return RTCPeer;

	function Broker(brokerUrl) {
		this.brokerUrl = brokerUrl;
		this.connected = false;
		this.connecting = false;

		this.onmessage = null;
		this.onconnect = null;
		this.ondisconnect = null;
		this.onhost = null;
		this.onunhost = null;
		this.onerror = null;

		this.channel = null;
		this.cid = null;		
		this.key = null;
		this.sid = null;
	};
	Broker.prototype.connect = function connect() {
		var that = this;

		// ensure that connect() is idempotent
		if(this.connecting)
			return;
		this.connecting = true;

		var channel = that.channel = new EventSource(that.brokerUrl + '/channel');
  	channel.addEventListener('error', function(event) {
      if(event.target.readyState == EventSource.CLOSED || event.target.readyState == EventSource.CONNECTING) {
        // Connection was closed.          
        console.log('broker channel closed');
        channel.close();
        that.connected = false;        
        callback(that, 'ondisconnect', []);
      } else {
      	return fail(that, 'onerror', event.target.readyState);
      }
    }, false);
    channel.addEventListener('control', function(event) {
      console.log('broker control message');
      var data = JSON.parse(event.data);
      that.cid = data['cid'];
      that.key = data['key'];

      that.connected = true;
      that.connecting = false;
      callback(that, 'onconnect', []);
    }, false);
    channel.addEventListener('message', function(event) {
      console.log('broker application message');
      var data = JSON.parse(event.data);
      var to = data['target'];
      var from = data['origin'];
      var message = data['message'];

      callback(that, 'onmessage', [to, from, message]);      
    }, false);
    that.channel = channel;

    return this;
	};
	Broker.prototype.disconnect = function disconnect(reason) {
		this.connected = false;
  	this.channel.close();
  	callback(this, 'ondisconnect', [reason]);

  	return this;
	};
	Broker.prototype.host = function host(options) {
		var that = this;

		if(!that.connected)
			throw new Error('broker not connected');
		if(that.sid)
  		throw new Error('broker already hosting');

  	options = options || {};
  	var that = that;
  	var url = that.brokerUrl + '/session';
    var xhr = new XMLHttpRequest();
    var request = {
      'cid': that.cid,
      'key': that.key,
      'list': options['list'],
      'metadata': options['metadata'],
      'url': options['url'] || window.location.toString(),
      'authenticate': options['authenticate'],
      'application': options['application']
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = function() {
      if(4 !== xhr.readyState) return;
      if(!(200 === xhr.status || 201 === xhr.status)) {
      	return fail(that, 'onerror', xhr.statusText + ': ' + xhr.responseText)        
      }

      var response = JSON.parse(xhr.responseText);      
      var sid = that.sid = response['sid'];

      callback(that, 'onhost', [sid]);
    };
    xhr.send(JSON.stringify(request));

		return this;
	};
	Broker.prototype.unhost = function unhost() {
		var that = this;

		if(!this.connected)
			throw new Error('broker not connected');
		if(!this.sid)
			throw new Error('broker not hosting');

		var url = that.brokerUrl + '/session/delete';
    var xhr = new XMLHttpRequest();
    var request = {
      'cid': that.cid,
      'key': that.key
    };

  	xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = function() {
      if(4 !== xhr.readyState) return;
      if(!(200 === xhr.status || 201 === xhr.status)) {
      	return fail(that, 'onerror', xhr.statusText + ': ' + xhr.responseText)        
      }

      that.sid = null;
      callback(that, 'onunhost', []);
    };
    xhr.send(JSON.stringify(request));

    return this;
	};
	Broker.prototype.send = function send(to, from, message) {
		var that = this;

		if(!this.connected)
			throw new Error('broker not connected');

  	var url = that.brokerUrl + '/send/' + to;
  	var xhr = new XMLHttpRequest();

    var request = {
      'origin': from,
      'key': that.key,
      'message': message
    };

    xhr.open('POST', url);
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.onreadystatechange = function() {
      if(4 !== xhr.readyState) return;
      if(!(200 === xhr.status || 201 === xhr.status)) {
      	return fail(that, 'onerror', xhr.statusText + ': ' + xhr.responseText)        
      }
    };
    xhr.send(JSON.stringify(request));
	};

	function WebRTCConnectProtocol() {
		this.oncomplete = null;
	};
	WebRTCConnectProtocol.prototype.process = function process(message) {

	};

	var nextConnectionId = 1;
	function Connection(peerConnection) {
		this.id = nextConnectionId ++;
		this.connected = false;

		this.ondisconnect = null;
		this.onerror = null;

		this.peerConnection = null;

		// DataChannels
		this.reliable = null;
		this.unreliable = null;
		this._control = null;	// for internal use only
	};
	Connection.prototype.close = function close() {

	};
	
	function Peer(brokerUrl, options) {
		var that = this;
		this.brokerUrl = brokerUrl;
		this.options = options || {};

		this.onconnect = null;
		this.onpending = null;
		this.onready = null;
		this.onnotready = null;
		this.onhost = null;
		this.onunhost = null;
		this.onerror = null;

		this.broker = new Broker(brokerUrl);
		this.pending = {};
		this.connections = {};

		this.broker.onconnect = function() {	
			callback(that, 'onready', []);
		};
		this.broker.ondisconnect = function() {
			callback(that, 'onnotready', []);
		};
		this.broker.onhost = function(sid) {
			callback(that, 'onhost', [sid]);
		};
		this.broker.onunhost = function() {
			callback(that, 'onunhost', []);
		}
		this.broker.connect();		
	};
	Peer.prototype._handleBrokerMessage = function _handleBrokerMessage(to, from, message) {
		var that = this;
		var handshake;
		if(!that.pending.hasOwnProperty(from)) {
			handshake = that.pending[from] = new WebRTCConnectProtocol();
			handshake.oncomplete = function(connection) {
				delete that.pending[from];
				that.connections[connection.id] = connection;
				callback(that, 'onconnect', [connection]);
			};
			handshake.onerror = function(error) {
				delete that.pending[from];
				callback(that, 'onerror', [error])
			};
		} else {
			handshake = that.pending[from];
		}
		var result = handshake.process(message);
		if(result) {
			// 'to' and 'from' are inverted because we're replying
			that.broker.send(from, to, result);
		}
	};
	Peer.prototype.host = function host(options) {
		var that = this;
		try {
			that.broker.host(options);
		} catch(e) {
			return fail(that, 'onerror', e);
		}
	};
	Peer.prototype.unhost = function unhost() {
		var that = this;
		try {
			that.broker.unhost();
		} catch(e) {
			return fail(that, 'onerror', e);
		}
	};
	Peer.prototype.connect = function connect(sid, options) {
		var that = this;
		var handshake = this.pending[sid] = new WebRTCConnectProtocol();
		handshake.oncomplete = function(connection) {
			delete that.pending[from];
			that.connections[connection.id] = connection;
			callback(that, 'onconnect', [connection]);
		};
		handshake.onerror = function(error) {
			delete that.pending[from];
			callback(that, 'onerror', [error])
		};
		var result = handshake.process();
		if(result) {
			this.broker.send(sid, this.cid, result);
		}
	};

	return Peer;

});
})(typeof define == 'function' && define.amd
? define
: function (deps, factory) { typeof exports === 'object'
? (module.exports = factory())
: (this.RTCPeer = factory());
},
// Boilerplate for AMD, Node, and browser global
this
);