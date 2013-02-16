(function(define, global) { 'use strict';
define(['module'], function(module) {

	var RTCPeerConnection;
	if(/*!window.RTCPeerConnection*/ true) {
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

	var nextDataConnectionPort = 1;
	function WebRTCConnectProtocol(options) {
		this.onmessage = null;
		this.oncomplete = null;		
		this.onerror = null;
		this.complete = false;
		this.options = options;
		this.options.ports = {
			local: nextDataConnectionPort ++,
			remote: null
		};

		this.peerConnection = null;
	};	
	WebRTCConnectProtocol.prototype.process = function process(message, cb) {
		var that = this;		
		if(undefined === message) {
			that.peerConnection = new RTCPeerConnection();
			getUserMedia({audio: true, fake: true}, function(stream) {
				that.peerConnection.addStream(stream);
				that.peerConnection.createOffer(function(offer) {
					var message = {
						'offer': offer.sdp,
						'port': that.options.ports.local
					};
					cb(message);
				}, function(error) {
					fail(that, 'onerror', error);
				});
			}, function(error) {
				fail(that, 'onerror', error);
			});
		} else if(message.hasOwnProperty('offer')) {
			var offer = message['offer'];
			that.options.ports.remote = message['port'];
			that.peerConnection = new RTCPeerConnection();			
			getUserMedia({audio: true, fake: true}, function(stream) {
				that.peerConnection.addStream(stream);
				that.peerConnection.setRemoteDescription({
					'type': 'offer',
          'sdp': offer
				}, function() {
					that.peerConnection.createAnswer(function(answer) {
						that.peerConnection.setLocalDescription(answer, function() {
							var message = {
								'answer': answer.sdp,
								'port': that.options.ports.local
							};							
							cb(message);
							var connection = new Connection(that.peerConnection, that.options, false);
							callback(that, 'oncomplete', [connection]);
						}, function(error) {
							fail(that, 'onerror', error);
						});
					}, function(error) {
						fail(that, 'onerror', error);
					});
				}, function(error) {
					fail(that, 'onerror', error);
				});
			}, function(error) {
				fail(that, 'onerror', error);
			});
		} else if(message.hasOwnProperty('answer')) {
			var answer = message['answer'];
			that.options.ports.remote = message['port'];
			that.peerConnection.setRemoteDescription({
				'type': 'answer',
				'sdp': answer
			}, function() {
				cb();
				var connection = new Connection(that.peerConnection, that.options, true);
				callback(that, 'oncomplete', [connection]);
			}, function(error) {
				fail(that, 'onerror', error);
			});
		}
	};

	var nextConnectionId = 1;
	function Connection(peerConnection, options, doSetup) {
		var that = this;
		this.id = nextConnectionId ++;
		this.connected = false;

		this.onconnect = null;
		this.ondisconnect = null;
		this.onerror = null;

		this.peerConnection = peerConnection;

		// DataChannels
		var reliable = null;
		var unreliable = null;
		var control = null;	// for internal use only		

		this.reliable = {
			send: null,
			onmessage: null,
			_channel: null
		};
		this.unreliable = {
			send: null,
			onmessage: null,
			_channel: null
		};

		var opened = 0;
		function handleOpen(event) {
			++ opened;
			if(3 === opened) {
				that.connected = true;
				connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
				callback(that, 'onconnect', []);
			}
		};

		var messageFlag = false;
		var connectionTimer = null;
    var pingTimer = null;
		function handleConnectionTimeoutExpired() {
      connectionTimer = null;
      if(false === messageFlag) {
        console.log('sending ping');
        control.send('PING');            
        pingTimer = window.setTimeout(handlePingTimeoutExpired, options['pingTimeout']);
      } else {
        messageFlag = false;
        connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
      }          
    };
    function handlePingTimeoutExpired() {
      pingTimer = null;
      if(false === messageFlag) {
        that.close();
      } else {
        messageFlag = false;
        connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
      }
    };

		if(doSetup) {
			this.peerConnection.onconnection = function() {
				reliable = peerConnection.createDataChannel('reliable', RELIABLE_CHANNEL_OPTIONS);
        unreliable = peerConnection.createDataChannel('unreliable', UNRELIABLE_CHANNEL_OPTIONS);
        control = peerConnection.createDataChannel('control', UNRELIABLE_CHANNEL_OPTIONS);

        reliable.binaryType = options['binaryType'];
        unreliable.binaryType = options['binaryType'];
        control.bineryType = 'arraybuffer';

        reliable.onopen = handleOpen;
        unreliable.onopen = handleOpen;
        control.onopen = handleOpen;

        that.reliable.send = function(message) {
        	reliable.send(message);
        };
        that.unreliable.send = function(message) {
        	unreliable.send(message);
        };

        that.reliable._channel = reliable;
        that.unreliable._channel = unreliable;

        reliable.onmessage = function(event) {
          messageFlag = true;
          if(that.connected) {
            callback(that.reliable, 'onmessage', [event]);
          }
        };       
        unreliable.onmessage = function(event) {
          messageFlag = true;
          if(that.connected) {
            callback(that.unreliable, 'onmessage', [event]);
          }
        };
        control.onmessage = function(event) {
          messageFlag = true;
          if(that.connected) {
            var message = event.data;
            if('PING' === message) {
              console.log('received ping, sending pong');
              control.send('PONG');
            } else if('PONG' === message) {
              console.log('received pong');
            } else if('QUIT' === message) {
              console.log('received quit');
              that.close();
            }
          }
        };        
			};
			that.peerConnection.connectDataConnection(options.ports.local, options.ports.remote);
		} else {
			this.peerConnection.ondatachannel = function(channel) {
				if('reliable' === channel.label) {
          reliable = that.reliable._channel = channel;
          that.reliable.send = function(message) {
          	channel.send(message);
          };
          channel.onmessage = function(event) {
            messageFlag = true;
            if(that.connected) {
              callback(that.reliable, 'onmessage', [event]);
            }
          };
        } else if('unreliable' === channel.label) {
          unreliable = that.unreliable._channel = channel;
          that.unreliable.send = function(message) {
          	channel.send(message);
          };
          channel.onmessage = function(event) {
            messageFlag = true;
            if(that.connected) {
              callback(that.unreliable, 'onmessage', [event]);
            }
          };
        } else if('control' === channel.label) {
          control = channel;
          channel.onmessage = function(event) {
            messageFlag = true;
            if(that.connected) {
              var message = event.data;
              if('PING' === message) {
                console.log('received ping, sending pong');
                control.send('PONG');
              } else if('PONG' === message) {
                console.log('received pong');
              } else if('QUIT' === message) {
                console.log('received quit');
                that.close();
              }
            }
          };
        } else {
          return fail(that, 'onerror', 'unknown data channel' + channel.label);
        }

        if('reliable' === channel.label || 'unreliable' === channel.label) {
          channel.binaryType = binaryType;
        } else if('control' === channel.label) {
          channel.binaryType = 'arraybuffer';
        }

        if(reliable && unreliable && control) {
          that.connected = true;
          connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
          callback(that, 'onconnect', []);
        }
			};
			that.peerConnection.connectDataConnection(options.ports.local, options.ports.remote);
		}
	};
	Connection.prototype.close = function close() {
		console.log('close connection');
	};
	
	function Peer(brokerUrl, options) {
		var that = this;
		this.brokerUrl = brokerUrl;
		this.options = options = options || {};
		options['binaryType'] = options['binaryType'] || 'arraybuffer';
		options['connectionTimeout'] = options['connectionTimeout'] || 10 * ONE_SECOND;
		options['pingTimeout'] = options['pingTimeout'] || 1 * ONE_SECOND;

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
		this.broker.onmessage = _handleBrokerMessage.bind(this);
		this.broker.connect();		
	};
	function _handleBrokerMessage(to, from, message) {
		var that = this;
		var handshake;
		if(!that.pending.hasOwnProperty(from)) {
			handshake = that.pending[from] = new WebRTCConnectProtocol(that.options);
			handshake.oncomplete = function(connection) {
				delete that.pending[from];				
				connection.onconnect = function() {
					that.connections[connection.id] = connection;
					callback(that, 'onconnect', [connection]);
				};
			};
			handshake.onerror = function(error) {
				delete that.pending[from];
				callback(that, 'onerror', [error])
			};
		} else {
			handshake = that.pending[from];
		}
		handshake.process(message, function(result) {
			if(result) {
				// 'to' and 'from' are inverted because we're replying
				that.broker.send(from, to, result);
			}
		});
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
	Peer.prototype.connect = function connect(sid) {
		var that = this;

		if(that.pending.hasOwnProperty(sid))
			throw new Error('already connecting to this host');

		var handshake = this.pending[sid] = new WebRTCConnectProtocol(that.options);
		handshake.oncomplete = function(connection) {
			delete that.pending[sid];
			connection.onconnect = function() {
				that.connections[connection.id] = connection;
				callback(that, 'onconnect', [connection]);
			};
		};
		handshake.onerror = function(error) {
			delete that.pending[sid];
			callback(that, 'onerror', [error])
		};
		handshake.process(undefined, function(result) {
			if(result) {				
				that.broker.send(sid, that.broker.cid, result);		
			}
		});
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