(function(define, global) { 'use strict';
define(['module'], function(module) {

  var ONE_SECOND = 1000; // One second in milliseconds

  function callback(thing, method, args) {
    if(method in thing && 'function' === typeof thing[method]) {
      thing[method].apply(thing, args);
    }
  }

  function Initiator(brokerUrl, sid)
  {
    var initiator = this;

    initiator.channel = undefined;
    initiator.cid = undefined;
    initiator.key = undefined;
    initiator.sid = sid;

    initiator.onpending = null;
    initiator.oncomplete = null;
    initiator.onerror = null;

    function fail(error) {
      if(initiator.onerror && 'function' === typeof initiator.onerror) {
        if (!(error instanceof Error))
          error = new Error(error);
        initiator.onerror.call(null, error);
      }
    };

    function sendMessage(target, origin, message, ok, err) {
      var url = brokerUrl + '/send/' + target;
      var xhr = new XMLHttpRequest();

      var request = {
        'origin': origin,
        'key': initiator.key,
        'message': message
      };

      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/json');
      xhr.onreadystatechange = function() {
        if(4 !== xhr.readyState) return;
        if(!(200 === xhr.status || 201 === xhr.status)) {
          if(err && 'function' === typeof err) {
            err(xhr.statusText + ': ' + xhr.responseText);
          }
        }

        if(ok && 'function' === typeof ok) {
          ok.call(null);
        }
      };
      xhr.send(JSON.stringify(request));
    }

    function handleMessage(target, origin, message) {
      if(message.hasOwnProperty('answer')) {
        initiator.channel.close();
        var answer = message['answer'];
        peerConnection.setRemoteDescription({
          'type': 'answer',
          'sdp': answer
        }, function() {
          callback(initiator, 'oncomplete', [peerConnection]);
        }, fail);        
      }
    };

    function sendOffer(target, origin, peerConnection) {
      // FIXME: make this portable
      navigator.mozGetUserMedia({audio: true, fake: true}, function(stream) {
        peerConnection.addStream(stream);
        peerConnection.createOffer(function(offer) {
          var message = {
            'offer': offer.sdp
          };
          sendMessage(target, origin, message, undefined, fail);
        }, fail);
      }, fail);
    };

    function createChannel() {
      var channel = new EventSource(brokerUrl + '/channel');
      channel.addEventListener('error', function(event)
      {
        if(event.target.readyState == EventSource.CLOSED || event.target.readyState == EventSource.CONNECTING) {
          // Connection was closed.          
          console.log('initiator: channel closed');
          channel.close();
        }
      }, false);
      channel.addEventListener('channel', function(event)
      {
        console.log('initiator: channel message');
        var data = JSON.parse(event.data);
        initiator.cid = data['cid'];
        initiator.key = data['key'];

        sendOffer(initiator.sid, initiator.cid, peerConnection);
      }, false);
      channel.addEventListener('message', function(event)
      {
        console.log('initiator: application message');
        var data = JSON.parse(event.data);
        var origin = data['origin'];
        var target = data['target'];
        var message = data['message'];

        handleMessage(target, origin, message);
      }, false);
      initiator.channel = channel;
    };
    
    var peerConnection = new mozRTCPeerConnection();
    createChannel();
  };

  function Responder(brokerUrl, options)
  {    
    var responder = this;
    options = options || {};
    options['session'] = options['session'] || {};
    var sessionOptions = options['session'];

    sessionOptions['list'] = (undefined !== sessionOptions['list']) ? sessionOptions['list'] : false;
    sessionOptions['metadata'] = (undefined !== sessionOptions['metadata']) ? sessionOptions['metadata'] : {};
    sessionOptions['url'] = (undefined !== sessionOptions['url']) ? sessionOptions['url'] : window.location.toString();
    sessionOptions['authenticate'] = (undefined !== sessionOptions['authenticate']) ? sessionOptions['authenticate'] : false;
    sessionOptions['application'] = (undefined !== sessionOptions['application']) ? sessionOptions['application'] : '?';

    responder.channel = undefined;
    responder.cid = undefined;
    responder.key = undefined;
    responder.sid = undefined;

    responder.onready = null;
    responder.onpending = null;
    responder.oncomplete = null;
    responder.onerror = null;

    function fail(error) {
      if(responder.onerror && 'function' === typeof responder.onerror) {
        if (!(error instanceof Error))
          error = new Error(error);
        responder.onerror.call(null, error);
      }
    };

    function sendMessage(target, origin, message, ok, err) {
      var url = brokerUrl + '/send/' + target;
      var xhr = new XMLHttpRequest();

      var request = {
        'origin': origin,
        'key': responder.key,
        'message': message
      };
      
      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/json');
      xhr.onreadystatechange = function() {
        if(4 !== xhr.readyState) return;
        if(!(200 === xhr.status || 201 === xhr.status)) {
          if(err && 'function' === typeof err) {
            err(xhr.statusText + ': ' + xhr.responseText);
          }
        }

        if(ok && 'function' === typeof ok) {
          ok.call(null);
        }
      };
      xhr.send(JSON.stringify(request));
    }

    function handleMessage(target, origin, message) {
      if(message.hasOwnProperty('offer')) {
        var offer = message['offer'];
        var peerConnection = new mozRTCPeerConnection();
        navigator.mozGetUserMedia({audio: true, fake: true}, function(stream) {
          peerConnection.addStream(stream);
          peerConnection.setRemoteDescription({
            'type': 'offer',
            'sdp': offer
          }, function() {
            peerConnection.createAnswer(function(answer) {
              peerConnection.setLocalDescription(answer, function() {
                var message = {
                  'answer': answer.sdp
                };
                sendMessage(origin, target, message, function() {
                  callback(responder, 'oncomplete', [peerConnection]);
                }, fail);
              }, fail);
            }, fail);
          }, fail);
        }, fail);
      }
    };

    function createSession() {
      var url = brokerUrl + '/session';
      var xhr = new XMLHttpRequest();
      var request = {
        'cid': responder.cid,
        'key': responder.key,
        'list': sessionOptions['list'],
        'metadata': sessionOptions['metadata'],
        'url': sessionOptions['url'],
        'authenticate': sessionOptions['authenticate'],
        'application': sessionOptions['application']
      };

      xhr.open('POST', url);
      xhr.setRequestHeader('content-type', 'application/json');
      xhr.onreadystatechange = function() {
        if(4 !== xhr.readyState) return;
        if(!201 === xhr.status) fail(xhr.statusText);

        var response = JSON.parse(xhr.responseText);
        responder.sid = response['sid'];

        callback(responder, 'onready', [responder.sid]);
      };
      xhr.send(JSON.stringify(request));
    };

    function createChannel() {
      var channel = new EventSource(brokerUrl + '/channel');      
      channel.addEventListener('error', function(event)
      {
        if(event.target.readyState == EventSource.CLOSED || event.target.readyState == EventSource.CONNECTING) {
          // Connection was closed.          
          console.log('responder: channel closed');
          channel.close();
        }
      }, false);
      channel.addEventListener('channel', function(event)
      {
        console.log('responder: channel message');
        var data = JSON.parse(event.data);
        var cid = data['cid'];
        var key = data['key'];

        responder.cid = cid;
        responder.key = key;

        createSession();        
      }, false);
      channel.addEventListener('message', function(event)
      {
        console.log('responder: application message');
        var data = JSON.parse(event.data);
        var origin = data['origin'];
        var target = data['target'];
        var message = data['message'];

        handleMessage(target, origin, message);
      }, false);
      responder.channel = channel;
    };    

    createChannel();    
  };
  Responder.prototype.close = function close() {
    this.channel.close();
  };

  var DEFAULT_CONNECTION_TIMEOUT = 10 * ONE_SECOND;
  var DEFAULT_PING_TIMEOUT = 1 * ONE_SECOND;

  var RELIABLE_CHANNEL_OPTIONS = {};
  var UNRELIABLE_CHANNEL_OPTIONS = {
    outOfOrderAllowed: true,
    maxRetransmitNum: 0
  };

  function Host(brokerUrl, options) {
    var host = this;

    options = options || {};
    options['binaryType'] = (undefined !== options['binaryType']) ? options['binaryType'] : 'arraybuffer';
    options['connectionTimeout'] = (undefined !== options['connectionTimeout']) ? options['connectionTimeout'] : DEFAULT_CONNECTION_TIMEOUT;
    options['pingTimeout'] = (undefined !== options['pingTimeout']) ? options['pingTimeout'] : DEFAULT_PING_TIMEOUT;

    host.connected = false;
    host.peerConnection = null;
    host.reliable = {
      channel: null,
      onmessage: null
    };
    host.unreliable = {
      channel: null,
      onmessage: null
    };
    var control = null;

    host.onready = null;
    host.onconnect = null;
    host.ondisconnect = null;
    host.onerror = null;
    host.close = function() {
      if(host.connected) {
        console.log('host quit');
        control.send('QUIT');
        shutdown();
      }
    };
    function shutdown() {      
      if(host.connected) {
        console.log('host disconnect');
        host.peerConnection.close();
        if(connectionTimer)
          window.clearInterval(connectionTimer);
        if(pingTimer)
          window.clearInterval(pingTimer);
        host.peerConnection = null;
        host.connected = false;
        callback(host, 'ondisconnect', []);
      }
    };

    var messageFlag = false;
    var connectionTimer = null;
    var pingTimer = null;

    var responder = new Responder(brokerUrl, options);
    responder.oncomplete = function(peerConnection) {
      console.log('responder.oncomplete', peerConnection);
      host.peerConnection = peerConnection;
      // FIXME: remove this so we can accept multiple peers
      responder.close();
      peerConnection.ondatachannel = function(channel) {
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
            shutdown();
          } else {
            messageFlag = false;
            connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
          }
        };

        if('reliable' === channel.label) {
          host.reliable.channel = channel;
          channel.onmessage = function(event) {
            messageFlag = true;
            if(host.connected) {
              callback(host.reliable, 'onmessage', [event]);
            }
          };
        } else if('unreliable' === channel.label) {
          host.unreliable.channel = channel;
          channel.onmessage = function(event) {
            messageFlag = true;
            if(host.connected) {
              callback(host.unreliable, 'onmessage', [event]);
            }
          };
        } else if('control' === channel.label) {
          control = channel;
          channel.onmessage = function(event) {
            messageFlag = true;
            if(host.connected) {
              var message = event.data;
              if('PING' === message) {
                console.log('received ping, sending pong');
                control.send('PONG');
              } else if('PONG' === message) {
                console.log('received pong');
              } else if('QUIT' === message) {
                console.log('received quit');
                shutdown();
              }
            }
          };
        } else {
          console.error('unknown data channel' + channel.label);
          return;
        }

        if('reliable' === channel.label || 'unreliable' === channel.label) {
          channel.binaryType = options['binaryType'];
        } else if('control' === channel.label) {
          channel.binaryType = 'arraybuffer';
        }

        if(host.reliable.channel && 
           host.unreliable.channel && control) {
          host.connected = true;
          connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
          callback(host, 'onconnect', []);
        }
      };
      peerConnection.onstatechange = function(event) {
        console.log('responder state change', event);
      };
      peerConnection.connectDataConnection(8001, 8000);
    };
    responder.onready = function(sid) {
      callback(host, 'onready', [sid]);
    };
    responder.onerror = function(error) {
      callback(host, 'onerror', [error]);
    };
  };

  function Peer(brokerUrl, sid, options) {
    var peer = this;

    options = options || {};
    options['binaryType'] = (undefined !== options['binaryType']) ? options['binaryType'] : 'arraybuffer';
    options['connectionTimeout'] = (undefined !== options['connectionTimeout']) ? options['connectionTimeout'] : DEFAULT_CONNECTION_TIMEOUT;
    options['pingTimeout'] = (undefined !== options['pingTimeout']) ? options['pingTimeout'] : DEFAULT_PING_TIMEOUT;

    peer.connected = false;
    peer.peerConnection = null;
    peer.reliable = {
      channel: null,
      onmessage: null
    };
    peer.unreliable = {
      channel: null,
      onmessage: null
    };
    var control = null;

    peer.onconnect = null;
    peer.ondisconnect = null;
    peer.onerror = null;
    peer.close = function() {
      if(peer.connected) {
        console.log('peer quit');
        control.send('QUIT');
        shutdown();
      }
    };
    function shutdown() {      
      if(peer.connected) {
        console.log('peer disconnect');
        peer.peerConnection.close();
        if(connectionTimer)
          window.clearInterval(connectionTimer);
        if(pingTimer)
          window.clearInterval(pingTimer);
        peer.peerConnection = null;
        peer.connected = false;
        callback(peer, 'ondisconnect', []);
      }
    };

    var messageFlag = false;
    var connectionTimer = null;
    var pingTimer = null;

    var initiator = new Initiator(brokerUrl, sid);
    initiator.oncomplete = function(peerConnection) {
      console.log('initiator.oncomplete', peerConnection);
      peer.peerConnection = peerConnection;
      peerConnection.onconnection = function() {
        var reliable = peerConnection.createDataChannel('reliable', RELIABLE_CHANNEL_OPTIONS);
        var unreliable = peerConnection.createDataChannel('unreliable', UNRELIABLE_CHANNEL_OPTIONS);
        control = peerConnection.createDataChannel('control', UNRELIABLE_CHANNEL_OPTIONS);
      
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
            shutdown();
          } else {
            messageFlag = false;
            connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout']);
          }          
        };

        reliable.binaryType = options['binaryType'];
        unreliable.binaryType = options['binaryType'];
        control.bineryType = 'arraybuffer';

        var opened = 0;
        function handleOpen(event) {
          if(3 === ++ opened) {
            peer.connected = true;
            connectionTimer = window.setTimeout(handleConnectionTimeoutExpired, options['connectionTimeout'] + options['connectionTimeout']/2);
            callback(peer, 'onconnect', []);
          }
        }
        reliable.onopen = handleOpen;
        unreliable.onopen = handleOpen;
        control.onopen = handleOpen;

        reliable.onmessage = function(event) {
          messageFlag = true;
          if(peer.connected) {
            callback(peer.reliable, 'onmessage', [event]);
          }
        };
        unreliable.onmessage = function(event) {
          messageFlag = true;
          if(peer.connected) {
            callback(peer.unreliable, 'onmessage', [event]);
          }
        };
        control.onmessage = function(event) {
          messageFlag = true;
          if(peer.connected) {
            var message = event.data;
            if('PING' === message) {
              console.log('received ping, sending pong');
              control.send('PONG');
            } else if('PONG' === message) {
              console.log('received pong');
            } else if('QUIT' === message) {
              console.log('received quit');
              shutdown();
            }
          }
        };

        peer.reliable.channel = reliable;
        peer.unreliable.channel = unreliable;      
      };
      peerConnection.onstatechange = function(event) {
        console.log('initiator state change', event);
      };
      peerConnection.connectDataConnection(8000, 8001);
    };
    initiator.onerror = function(error) {
      callback(peer, 'onerror', [error]);
    };
  };

  return {
    Host: Host,
    Peer: Peer
  };

});
})(typeof define == 'function' && define.amd
? define
: function (deps, factory) { typeof exports === 'object'
? (module.exports = factory())
: (this.WebRTC = factory());
},
// Boilerplate for AMD, Node, and browser global
this
);
