/*global define exports module*/
;(function(define, global) { 'use strict';
define(['module'], function(module) {
  var webrtcSupported = 'RTCPeerConnection' in window;

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

  function defer(queue, object, method, args) {
    if(queue) {
      queue.push([object, method, args]);
      return true;
    } else {
      return false;
    }
  };

  function processDeferredQueue(queue) {
    while(queue.length) {
      var deferred = queue.shift();
      callback(deferred[0], deferred[1], deferred[2]);
    }
  };

  var ONE_SECOND = 1000; // milliseconds
  var DEFAULT_CONNECTION_TIMEOUT = 10 * ONE_SECOND;
  var DEFAULT_PING_TIMEOUT = 1 * ONE_SECOND;
  var RELIABLE_CHANNEL_OPTIONS = {
    reliable: false
  };
  var UNRELIABLE_CHANNEL_OPTIONS = {
    outOfOrderAllowed: true,
    maxRetransmitNum: 0,
    reliable: false
  };

  function PendingConnectionAbortError(message) {
    this.name = "PendingConnectionAbortError";
    this.message = (message || "");
  };
  PendingConnectionAbortError.prototype = Error.prototype;

  function ConnectionFailedError(message) {
    this.name = "ConnectionFailedError";
    this.message = (message || "");
  };
  ConnectionFailedError.prototype = Error.prototype;

  var E = {
    PendingConnectionAbortError: PendingConnectionAbortError,
    ConnectionFailedError: ConnectionFailedError
  };

  function WebSocketBroker(brokerUrl) {
    this.brokerUrl = brokerUrl;
    this.state = WebSocketBroker.OFFLINE;

    this.onstatechange = null;
    this.onreceive = null;
    this.onerror = null;

    this.socket = null;
    this.route = null;
  };

  // States
  WebSocketBroker.OFFLINE     = 0x01;
  WebSocketBroker.CONNECTING  = 0x02;
  WebSocketBroker.CONNECTED   = 0x04;
  // Flags
  WebSocketBroker.ROUTED      = 0x10;
  WebSocketBroker.LISTENING   = 0x20;

  WebSocketBroker.prototype.setState = function setState(state, clearFlags) {
    var clear = clearFlags ? 0x00 : 0xF0;
    this.state &= clear >>> 0;
    this.state |= state >>> 0;
    callback(this, 'onstatechange', [this.state, (state | (clear & 0x0)) >>> 0]);
  };
  WebSocketBroker.prototype.setFlag = function setFlag(flag) {
    this.state = (this.state | flag) >>> 0;
    callback(this, 'onstatechange', [this.state, flag]);
  };
  WebSocketBroker.prototype.clearFlag = function clearFlag(flag) {
    flag = (~flag) >>> 0;
    this.state = (this.state & flag) >>> 0;
    callback(this, 'onstatechange', [this.state, flag]);
  };
  WebSocketBroker.prototype.checkState = function checkState(mask) {
    return !!(this.state & mask);
  };
  WebSocketBroker.prototype.connect = function connect() {
    var that = this;
    var socket = new WebSocket(this.brokerUrl);
    that.setState(WebSocketBroker.CONNECTING, true);

    socket.onopen = function () {
      that.setState(WebSocketBroker.CONNECTED, true);
    };

    socket.onclose = function () {
      that.setState(WebSocketBroker.OFFLINE, true);
    };

    socket.onerror = function (error) {
    	console.error(error);
      fail(that, 'onerror', error);
    };

    function onroute(route) {
      that.route = route;
      that.setFlag(WebSocketBroker.ROUTED);
    };

    function onreceive(message) {
      var from = message['from'];
      var data = message['data'];
      callback(that, 'onreceive', [from, data]);
    }

    function onlistenresponse(response) {
      if(response && response['error']) {
        var error = new Error(response['error']);
        fail(that, 'onerror', error);
      } else {
        that.setFlag(WebSocketBroker.LISTENING);
      }
    }

    function onignoreresponse(response) {
      if(response && response['error']) {
        var error = new Error(response['error']);
        fail(that, 'onerror', error);
      } else {
        that.clearFlag(WebSocketBroker.LISTENING);
      }
    }

    function onsendresponse(response) {
      if(response && response['error']) {
        var error = new Error(response['error']);
        fail(that, 'onerror', error);
      }
    }

    socket.onmessage = function (event) {
      var data = JSON.parse(event.data);
      if (data.type == 'route') {
        onroute(data.data);
      } else if (data.type == 'receive') {
        onreceive(data.data);
      } else if (data.type == 'listen_response') {
        onlistenresponse(data.data);
      } else if (data.type == 'ignore_response') {
        onignoreresponse(data.data);
      } else if (data.type == 'send_response') {
        onsendresponse(data.data);
      } else {
        console.warn('Unhandled message type: %s', data.type);
      }
    };

    this.socket = socket;
  };
  function emit(sock, type, data) {
    sock.send(JSON.stringify({type: type, data: data}));
  }
  WebSocketBroker.prototype.disconnect = function disconnect() {
    if(this.checkState(WebSocketBroker.CONNECTED)) {
      this.socket.close();
      this.setState(WebSocketBroker.OFFLINE, true);
      return true;
    } else {
      return false;
    }
  };
  WebSocketBroker.prototype.listen = function listen(options) {
    var that = this;
    if(this.checkState(WebSocketBroker.CONNECTED)) {
      emit(this.socket, 'listen', options);
    }
  };
  WebSocketBroker.prototype.ignore = function ignore() {
    var that = this;
    if(this.checkState(WebSocketBroker.CONNECTED)) {
      emit(this.socket, 'ignore', null);
    }
  };
  WebSocketBroker.prototype.send = function send(to, message) {
    var that = this;
    if(this.checkState(WebSocketBroker.CONNECTED)) {
      emit(this.socket, 'send', {'to': to, 'data': message});
    }
  };

  var dataChannels = {
    'reliable': 'RELIABLE',
    'unreliable': 'UNRELIABLE',
    '@control': 'RELIABLE'
  };
  function RTCConnectProtocol(options) {
    this.options = options;
    // FIXME: these timeouts should be configurable
    this.connectionTimeout = 10 * ONE_SECOND;
    this.pingTimeout = 1 * ONE_SECOND;
    this.connectionServers = {iceServers:[{url:'stun:stun.l.google.com:19302'}]};
    this.connectionOptions = null;
    this.channelOptions = {
      RELIABLE: {
        // defaults
      },
      UNRELIABLE: {
        ordered: false,
        maxRetransmits: 0
      }
    };
    this.onmessage = null;
    this.oncomplete = null;
    this.onerror = null;

    this.complete = false;
    this.streams = {
      local: null,
      remote: null
    };
    this.initiator = false;
    this.peerConnection = null;
    this.channels = {};
    this._pending = {};
  };
  RTCConnectProtocol.prototype.process = function process(message) {
    var that = this;

    var type = message['type'];
    switch(type) {
      case 'ice':
        var candidate = JSON.parse(message['candidate']);
        if(candidate)
          this.handleIce(candidate);
        break;

      case 'offer':
        var offer = {
          'type': 'offer',
          'sdp': message['description']
        };
        this.handleOffer(offer);
        break;

      case 'answer':
        var answer = {
          'type': 'answer',
          'sdp': message['description']
        };
        this.handleAnswer(answer);
        break;

      case 'abort':
        this.handleAbort();
        break;

      default:
        fail(this, 'onerror', 'unknown message');
    }
  };
  RTCConnectProtocol.prototype.handleAbort = function handleAbort() {
    fail(this, 'onerror', new Error(E.RTCConnectProtocolAbort));
  };
  RTCConnectProtocol.prototype.initialize = function initialize(cb) {
    var that = this;

    if(this.peerConnection)
      return cb();

    // FIXME: peer connection servers should be configurable
    this.peerConnection = new RTCPeerConnection(this.connectionServers, this.connectionOptions);
    this.peerConnection.onicecandidate = function(event) {
      var message = {
        'type': 'ice',
        'candidate': JSON.stringify(event.candidate)
      };
      callback(that, 'onmessage', message);
    };
    this.peerConnection.onaddstream = function(event) {
      that.streams['remote'] = event.stream;
    };
    this.peerConnection.onsignalingstatechange = function(event) {
      console.log(event.target.signalingState);
    };
    this.peerConnection.onstatechange = function(event) {
      console.log(event.target.readyState);
    };

    var useVideo = !!that.options['video'];
    var useAudio = !!that.options['audio'];
    if (!useVideo && !useAudio)
      return cb();

    navigator.mediaDevices.getUserMedia({video: useVideo, audio: useAudio})
      .then(function(stream) {
        that.peerConnection.addStream(stream);
        that.streams['local'] = stream;
        cb();
      })
      .catch(function(error) {
          console.error('!', error);
        fail(that, 'onerror', error);
      });
  };
  RTCConnectProtocol.prototype.handleIce = function handleIce(candidate) {
    var that = this;

    function setIce() {
      if(!that.peerConnection.remoteDescription) {
        return;
      }
      that.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    }

    this.initialize(setIce);
  };
  RTCConnectProtocol.prototype.initiate = function initiate() {
    var that = this;
    this.initiator = true;

    function createDataChannels() {
      var labels = Object.keys(dataChannels);
      labels.forEach(function(label) {
        var channelOptions = that.channelOptions[dataChannels[label]];
        var channel = that._pending[label] = that.peerConnection.createDataChannel(label, channelOptions);
        channel.binaryType = that.options['binaryType'];
        channel.onopen = function() {
          that.channels[label] = channel;
          delete that._pending[label];
          if(Object.keys(that.channels).length === labels.length) {
            that.complete = true;
            callback(that, 'oncomplete', []);
          }
        };
        channel.onerror = function(error) {
          console.error(error);
          fail(that, 'onerror', error);
        };
      });
      createOffer();
    };

    function createOffer() {
      that.peerConnection.createOffer()
        .then(setLocal)
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    };

    function setLocal(description) {
      that.peerConnection.setLocalDescription(new RTCSessionDescription(description))
        .then(function () {
          var message = {
            'type': 'offer',
            'description': description['sdp']
          };
          callback(that, 'onmessage', message);
        })
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    };

    this.initialize(createDataChannels);
  };
  RTCConnectProtocol.prototype.handleOffer = function handleOffer(offer) {
    var that = this;

    function handleDataChannels() {
      var labels = Object.keys(dataChannels);
      that.peerConnection.ondatachannel = function(event) {
        var channel = event.channel;
        var label = channel.label;
        that._pending[label] = channel;
        channel.binaryType = that.options['binaryType'];
        channel.onopen = function() {
          that.channels[label] = channel;
          delete that._pending[label];
          if(Object.keys(that.channels).length === labels.length) {
            that.complete = true;
            callback(that, 'oncomplete', []);
          }
        };
        channel.onerror = function(error) {
          console.error(error);
          fail(that, 'onerror', error);
        };
      };
      setRemote();
    }

    function setRemote() {
      that.peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
        .then(createAnswer)
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    }

    function createAnswer() {
      that.peerConnection.createAnswer()
        .then(setLocal)
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    }

    function setLocal(description) {
      that.peerConnection.setLocalDescription(new RTCSessionDescription(description))
        .then(function () {
          var message = {
            'type': 'answer',
            'description': description['sdp']
          };
          callback(that, 'onmessage', message);
        })
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    }

    this.initialize(handleDataChannels);
  };
  RTCConnectProtocol.prototype.handleAnswer = function handleAnswer(answer) {
    var that = this;

    function setRemote() {
      that.peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
        .then(complete)
        .catch(function(error) {
          fail(that, 'onerror', error);
        });
    }

    function complete() {
    }

    this.initialize(setRemote);
  };

  // FIXME: this could use a cleanup
  var nextConnectionId = 1;
  function Connection(options, peerConnection, streams, channels) {
    var that = this;
    this.id = nextConnectionId ++;
    this.streams = streams;
    this.connected = false;
    this.messageFlag = false;

    this.onmessage = null;
    this.ondisconnect = null;
    this.onerror = null;

    this.peerConnection = peerConnection;

    // DataChannels
    this.channels = channels;

    this.connectionTimer = null;
    this.pingTimer = null;

    function handleConnectionTimerExpired() {
      if(!that.connected)
        return;
      this.connectionTimer = null;
      if(false === that.messageFlag) {
        that.channels['@control'].send('ping');
        this.pingTimer = window.setTimeout(handlePingTimerExpired, options['pingTimeout']);
      } else {
        that.messageFlag = false;
        this.connectionTimer = window.setTimeout(handleConnectionTimerExpired, options['connectionTimeout']);
      }
    };
    function handlePingTimerExpired() {
      if(!that.connected)
        return;
      this.pingTimer = null;
      if(false === that.messageFlag) {
        that.connected = false;
        that.close();
      } else {
        that.messageFlag = false;
        this.connectionTimer = window.setTimeout(handleConnectionTimerExpired, options['connectionTimeout']);
      }
    };

    Object.keys(this.channels).forEach(function(label) {
      var channel = that.channels[label];
      if(label.match('^@')) // check for internal channels
        return;

      channel.onmessage = function onmessage(message) {
        that.messageFlag = true;
        callback(that, 'onmessage', [label, message]);
      };
    });
    this.channels['@control'].onmessage = function onmessage(message) {
      that.messageFlag = true;
      if(that.connected) {
        var data = message.data;
        if('ping' === data) {
          that.channels['@control'].send('pong');
        } else if('pong' === data) {
          // ok
        } else if('quit' === data) {
          that.close();
        }
      }
    };

    this.connected = true;
    this.connectionTimer = window.setTimeout(handleConnectionTimerExpired, options['connectionTimeout']);
  };
  Connection.prototype.close = function close() {
    console.log('close connection');
    if(this.connected) {
      this.channels['@control'].send('quit');
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
  Connection.prototype.send = function send(label, message) {
    this.channels[label].send(message);
  };

  function PendingConnection(route, incoming) {
    this.route = route;
    this.incoming = incoming;
    this.proceed = true;
  };
  PendingConnection.prototype.accept = function accept() {
    this.proceed = true;
  };
  PendingConnection.prototype.reject = function reject() {
    this.proceed = false;
  };

  function Peer(brokerUrl, options) {
    if(!webrtcSupported)
      throw new Error("WebRTC not supported");

    var that = this;
    this.brokerUrl = brokerUrl;
    this.options = options = options || {};
    options['binaryType'] = options['binaryType'] || 'arraybuffer';
    options['connectionTimeout'] = options['connectionTimeout'] || 10 * ONE_SECOND;
    options['pingTimeout'] = options['pingTimeout'] || 1 * ONE_SECOND;

    this.onconnection = null;
    this.onpending = null;
    this.onroute = null;
    this.onerror = null;

    this.broker = new WebSocketBroker(brokerUrl);
    this.broker.onerror = function(error) {
    	fail(that, 'onerror', error);
    };
    this.pending = {};

    this.queues = {
      connected: [],
      listening: []
    };

    this.broker.onstatechange = function onstatechange(state, mask) {
      if(that.queues.connected.length && that.broker.checkState(WebSocketBroker.ROUTED)) {
        processDeferredQueue(that.queues.connected);
        if(that.queues.listening.length && that.broker.checkState(WebSocketBroker.LISTENING)) {
          processDeferredQueue(that.queues.listening);
        }
      }
      if(mask & WebSocketBroker.ROUTED) {
        callback(that, 'onroute', that.broker.route);
      }
    };

    this.broker.onreceive = function onreceive(from, message) {
      var handshake;
      if(!that.pending.hasOwnProperty(from)) {
        if(!that.broker.checkState(WebSocketBroker.LISTENING)) {
          return;
        }

        var pendingConnection = new PendingConnection(from, /*incoming*/ true);
        callback(that, 'onpending', [pendingConnection]);
        if(!pendingConnection['proceed'])
          return;

        handshake = that.pending[from] = new RTCConnectProtocol(that.options);
        handshake.oncomplete = function() {
          var connection = new Connection(that.options, handshake.peerConnection, handshake.streams, handshake.channels);
          connection['route'] = from;
          delete that.pending[from];
          callback(that, 'onconnection', [connection]);
        };
        handshake.onmessage = function(message) {
          that.broker.send(from, message);
        };
        handshake.onerror = function(error) {
          delete that.pending[from];
          callback(that, 'onerror', [error]);
        };
      } else {
        handshake = that.pending[from];
      }
      handshake.process(message);
    };

    this.broker.connect();
  };
  Peer.prototype.listen = function listen(options) {
    if(!this.broker.checkState(WebSocketBroker.ROUTED))
      return defer(this.queues.connected, this, 'listen', [options]);

    options = options || {};
    options['url'] = options['url'] || window.location.toString();
    options['listed'] = (undefined !== options['listed']) ? options['listed'] : true;
    options['metadata'] = options['metadata'] || {};

    this.broker.listen(options);
  };
  Peer.prototype.ignore = function ignore() {
    throw new Error('not implemented');
  };
  Peer.prototype.connect = function connect(route) {
    if(!this.broker.checkState(WebSocketBroker.ROUTED))
      return defer(this.queues.connected, this, 'connect', [route]);

    var that = this;

    if(this.pending.hasOwnProperty(route))
      throw new Error('already connecting to this host'); // FIXME: we can handle this better

    var pendingConnection = new PendingConnection(route, /*incoming*/ false);
    callback(that, 'onpending', [pendingConnection]);
    if(!pendingConnection['proceed'])
      return;

    var handshake = this.pending[route] = new RTCConnectProtocol(this.options);
    handshake.oncomplete = function() {
      var connection = new Connection(this.options, handshake.peerConnection, handshake.streams, handshake.channels);
      connection['route'] = route;
      delete that.pending[route];
      callback(that, 'onconnection', [connection]);
    };
    handshake.onmessage = function(message) {
      that.broker.send(route, message);
    };
    handshake.onerror = function(error) {
      delete that.pending[route];
      fail(that, 'onerror', error);
    };

    handshake.initiate();
  };
  Peer.prototype.close = function close() {
    this.broker.disconnect();
  };
  Peer.E = E;

  return Peer;

});
})(typeof define == 'function' && define.amd
? define
: function (deps, factory) { typeof exports === 'object'
? (module.exports = factory())
: (this.Peer = factory());
},
// Boilerplate for AMD, Node, and browser global
this
);
