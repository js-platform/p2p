(function(define, global) { 'use strict';
define(['module'], function(module) {

	/* Notes
	 *
	 * - Continue using prefixed names for now.
	 *
	 */

	var RTCPeerConnection;
	if(window.mozRTCPeerConnection)
		RTCPeerConnection = window.mozRTCPeerConnection;
	else if(window.webkitRTCPeerConnection)
		RTCPeerConnection = window.webkitRTCPeerConnection;
	else if(window.RTCPeerConnection)
		RTCPeerConnection = window.RTCPeerConnection
	else
		throw new Error('RTCPeerConnection not supported');

	var RTCSessionDescription;
	if(window.mozRTCSessionDescription)
		RTCSessionDescription = window.mozRTCSessionDescription;
	else if(window.webkitRTCSessionDescription)
		RTCSessionDescription = window.webkitRTCSessionDescription;
	else if(window.RTCSessionDescription)
		RTCSessionDescription = window.RTCSessionDescription
	else
		throw new Error('RTCSessionDescription not supported');

	var RTCIceCandidate;
	if(window.mozRTCIceCandidate)
		RTCIceCandidate = window.mozRTCIceCandidate;
	else if(window.webkitRTCIceCandidate)
		RTCIceCandidate = window.webkitRTCIceCandidate;
	else if(window.RTCIceCandidate)
		RTCIceCandidate = window.RTCIceCandidate;
	else
		throw new Error('RTCIceCandidate not supported');

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
		channel.addEventListener('open', function(event) {
			console.log('broker channel open');
		});
  	channel.addEventListener('error', function(event) {
      if(event.target.readyState == EventSource.CLOSED) {
        // Connection was closed.
        console.log('broker channel closed');
        channel.close();
        that.connected = false;
        callback(that, 'ondisconnect', []);
      } else if(event.target.readyState == EventSource.CONNECTING) {
      	console.log('broker abort reconnect');
      	channel.close();
      	that.connected = false;
      	callback(that, 'ondisconnect', []);
      } else {
      	return fail(that, 'onerror', event.target.readyState);
      }
    });
    channel.addEventListener('control', function(event) {
      console.log('broker control message');
      var data = JSON.parse(event.data);
      that.cid = data['cid'];
      that.key = data['key'];

      that.connected = true;
      that.connecting = false;
      callback(that, 'onconnect', []);
    });
    channel.addEventListener('message', function(event) {
      console.log('broker application message');
      var data = JSON.parse(event.data);
      var to = data['target'];
      var from = data['origin'];
      var message = data['message'];

      callback(that, 'onmessage', [to, from, message]);
    });
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

	var peerConnectionOptions = {
		'optional': [{ 'RtpDataChannels': true }],
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
		this.options.streams = {
			local: null,
			remote: null
		};

		this.peerConnection = null;
	};
	WebRTCConnectProtocol.prototype.initialize = function(cb) {
		var that = this;

		if(this.peerConnection)
			return cb();

		this.peerConnection = new RTCPeerConnection(null, peerConnectionOptions);
		this.peerConnection.onicecandidate = function(event) {
			var message = {
				'type': 'ice',
				'candidate': JSON.stringify(event.candidate)
			};
			callback(that, 'onmessage', message);
		};
		this.peerConnection.onaddstream = function(event) {
			that.options.streams['remote'] = event.stream;
		}

		function createStream(useFake) {
			useFake = (!useVideo && !useAudio) ? true : useFake;
			var useVideo = !!that.options['video'];
			var useAudio = !!that.options['audio'];
			var mediaOptions = {
				video: useVideo,
				audio: (!useVideo && !useAudio) ? true : useAudio,
				fake: useFake
			};
			getUserMedia(mediaOptions,
				function(stream) {
					that.peerConnection.addStream(stream);
					that.options.streams['local'] = stream;
					cb();
				},
				function(error) {
					console.error('!', error);
					if(!useFake)
						createStream(true);
					else
						fail(that, 'onerror', error);
				}
			);
		}

		createStream();
	};
	WebRTCConnectProtocol.prototype.initiate = function initiate() {
		var that = this;

		function createOffer() {
			that.peerConnection.createOffer(setLocal,
				function(error) {
					fail(that, 'onerror', error);
				}
			);
		};

		function setLocal(description) {
			that.peerConnection.setLocalDescription(new RTCSessionDescription(description), complete,
				function(error) {
					fail(that, 'onerror', error);
				}
			);

			function complete() {
				var message = {
					'type': 'offer',
					'description': description['sdp'],
					'port': that.options.ports.local
				};
				callback(that, 'onmessage', message);
			};
		};

		this.initialize(createOffer);
	};
	WebRTCConnectProtocol.prototype.handleIce = function handleIce(candidate) {
		var that = this;

		function setIce() {
			if(!that.peerConnection.remoteDescription)
				return

			that.peerConnection.addIceCandidate(new RTCIceCandidate(candidate),
				function(error) {
					fail(that, 'onerror', error);
				}
			);
		};

		this.initialize(setIce);
	};
	WebRTCConnectProtocol.prototype.handleOffer = function handleOffer(offer) {
		var that = this;

		function setRemote() {
			that.peerConnection.setRemoteDescription(new RTCSessionDescription(offer), createAnswer,
				function(error) {
					fail(that, 'onerror', error);
				}
			);
		};

		function createAnswer() {
			that.peerConnection.createAnswer(setLocal,
				function(error) {
					fail(that, 'onerror', error);
				}
			);
		};

		function setLocal(description) {
			that.peerConnection.setLocalDescription(new RTCSessionDescription(description), complete,
				function(error) {
					fail(that, 'onerror', error);
				}
			);

			function complete() {
				var message = {
					'type': 'answer',
					'description': description['sdp'],
					'port': that.options.ports.local
				};
				callback(that, 'onmessage', message);
				var connection = new Connection(that.peerConnection, that.options, false);
				callback(that, 'oncomplete', [connection]);
			};
		};

		this.initialize(setRemote);
	};
	WebRTCConnectProtocol.prototype.handleAnswer = function handleAnswer(answer) {
		var that = this;

		function setRemote() {
			that.peerConnection.setRemoteDescription(new RTCSessionDescription(answer), complete,
				function(error) {
					fail(that, 'onerror', error);
				}
			);
		};

		function complete() {
			var connection = new Connection(that.peerConnection, that.options, true);
			callback(that, 'oncomplete', [connection]);
		};

		this.initialize(setRemote);
	};
	WebRTCConnectProtocol.prototype.process = function process(message) {
		var that = this;

		var type = message['type'];
		switch(type) {
			case 'ice':
				//this.handleIce(JSON.parse(message['candidate']));
				break;

			case 'offer':
				that.options.ports.remote = message['port'];
				var offer = {
					'type': 'offer',
					'sdp': message['description']
				};
				this.handleOffer(offer);
				break;

			case 'answer':
				that.options.ports.remote = message['port'];
				var answer = {
					'type': 'answer',
					'sdp': message['description']
				};
				this.handleAnswer(answer);
				break;

			default:
				fail(this, 'onerror', 'unknown message');
		}
	};

	var nextConnectionId = 1;
	function Connection(peerConnection, options, initiate) {
		var that = this;
		this.id = nextConnectionId ++;
		this.streams = options.streams;
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
		this._control = null;

		var opened = 0;
		function handleOpen(event) {
			++ opened;
			if(3 === opened) {
				that.connected = true;
				this.connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
				callback(that, 'onconnect', []);
			}
		};

		var messageFlag = false;
		this.connectionTimer = null;
		this.pingTimer = null;
		function handleConnectionTimeoutExpired() {
			if(!that.connected)
				return
      this.connectionTimer = null;
      if(false === messageFlag) {
        console.log('sending ping');
        control.send('PING');
        this.pingTimer = window.setTimeout(handlePingTimeoutExpired, options['pingTimeout']);
      } else {
        messageFlag = false;
        this.connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
      }
    };
    function handlePingTimeoutExpired() {
    	if(!that.connected)
				return
      this.pingTimer = null;
      if(false === messageFlag) {
      	that.connected = false;
        that.close();
      } else {
        messageFlag = false;
        this.connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
      }
    };

		if(initiate) {
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
        that._control = control;

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
          control = that._control = channel;
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
                that.connected = false;
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
          this.connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
          callback(that, 'onconnect', []);
        }
			};
			that.peerConnection.connectDataConnection(options.ports.local, options.ports.remote);
		}
	};
	Connection.prototype.close = function close() {
		console.log('close connection');
		if(this.connected) {
			this._control.send('QUIT');
		}
		this.connected = false;
		this.peerConnection.close();
		if(this.connectionTimer) {
			window.clearInterval(this.connectionTimer);
			this.connectionTimer = null;
		}
		if(this.pingTimer) {
			window.clearInterval(this.pingTimer);
			this.pingTimer = null;
		}
		this.peerConnection = null;
		callback(this, 'ondisconnect', []);
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
					callback(that, 'onconnect', [connection]);
				};
			};
			handshake.onmessage = function(message) {
				// 'to' and 'from' are inverted because we're replying
				that.broker.send(from, to, message);
			};
			handshake.onerror = function(error) {
				delete that.pending[from];
				callback(that, 'onerror', [error])
			};
		} else {
			handshake = that.pending[from];
		}
		handshake.process(message);
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
				callback(that, 'onconnect', [connection]);
			};
		};
		handshake.onmessage = function(message) {
			that.broker.send(sid, that.broker.cid, message);
		};
		handshake.onerror = function(error) {
			delete that.pending[sid];
			callback(that, 'onerror', [error])
		};
		handshake.initiate();
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