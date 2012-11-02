(function(define, global) { 'use strict';
define(['module'], function(module) {
  var default_broker = "http://webrtc-broker.herokuapp.com";
  function callback(thing, method, args) {
    if(method in thing && 'function' === typeof thing[method]) {
      thing[method].apply(thing, args);
    }
  }

  // DataChannelConnection wraps the Offer/Answer classes even further.
  // It adds two DataChannels to the PeerConnection: a reliable (TCP-like)
  // channel and an unreliable (UDP-like) channel, named .reliable and
  // .unreliable respectively.
  // There are four callbacks supported by DataChannelConnection:
  // onconnect: Called when both DataChannels are open.
  // onerror: Called whenever some sort of error happens.
  // onreliablemessage: Called when data arrives on the reliable channel.
  // onunreliablemessage: Called when data arrives on the unreliable channel.
  //TODO: support closing connection, handle closed events.
  function DataChannelConnection(broker, offer_id) {
    this.connected = false;
    this.onoffercreated = null;
    this.onconnect = null;
    this.ondisconnect = null;
    this.onreliablemessge = null;
    this.onunreliablemessage = null;
    this.reliable = null;
    this.unreliable = null;

    var self = this;
    if (!broker)
      broker = default_broker;

    if (offer_id) {
      // Connecting to an offered connection.
      var answer = new WebRTCBrokerClient.Answer(broker + "/offer/" + offer_id);
      answer.oncomplete = function(pc) {
        console.log("answer.oncomplete");
        // Connect up some event listeners.
        pc.ondatachannel = function(channel) {
          console.log("pc.ondatachannel: " + channel.label);
          if (channel.label == "reliable") {
            if (self.reliable) {
              callback(self, "onerror",
                       ["Too many reliable DataChannels open!"]);
              return;
            }
            self.reliable = channel;
          } else if (channel.label == "unreliable") {
            if (self.unreliable) {
              callback(self, "onerror",
                       ["Too many unreliable DataChannels open!"]);
              return;
            }
            self.unreliable = channel;
          } else {
            console.log("unknown DataChannel " + channel.label);
            return;
          }
          if (self.reliable && self.unreliable) {
            self.connected = true;
            callback(self, "onconnect", []);
          }
          channel.binaryType = "blob";
          channel.onmessage = function(event) {
            callback(self,
                     channel.reliable ? "onreliablemessage"
                                      : "onunreliablemessage",
                     [event]);
          };
        };

        //XXX: this is a hack until the DataChannel APIs are finalized.
        pc.connectDataConnection(8001,8000);
      };
      answer.onerror = function(e) {
        callback(self, 'onerror', [e]);
      };
    } else {
      // Creating a new offer
      var offer = new WebRTCBrokerClient.Offer(broker);
      offer.onpending = function(url) {
        console.log("offer.onpending");
        callback(self, 'onoffercreated', [url, offer.id]);
      };
      offer.oncomplete = function(pc) {
        console.log("offer.oncomplete");
        function datachannelopen() {
          self.channels_open++;
          if (self.channels_open == 2) {
            self.connected = true;
            callback(self, "onconnect", []);
          }
        }
        pc.onconnection = function() {
          self.channels_open = 0;
          self.reliable = pc.createDataChannel("reliable", {});
          self.reliable.binaryType = "blob";
          self.reliable.onmessage = function(event) {
            callback(self, "onreliablemessage", [event]);
          };
          self.reliable.onopen = datachannelopen;

          self.unreliable = pc.createDataChannel("unreliable",
                                                 {outOfOrderAllowed: true,
                                                  maxRetransmitNum: 0});
          self.unreliable.binaryType = "blob";
          self.unreliable.onmessage = function(event) {
            callback(self, "onunreliablemessage", [event]);
          };
          self.unreliable.onopen = datachannelopen;
        };
        //XXX: this is a hack until the DataChannel APIs are finalized.
        pc.connectDataConnection(8000,8001);
      };
      offer.onerror = function(e) {
        callback(self, 'onerror', [e]);
      };
    };
  }

  return {
    DataChannelConnection: DataChannelConnection
  };

});
})(typeof define == 'function' && define.amd
? define
: function (deps, factory) { typeof exports === 'object'
? (module.exports = factory())
: (this.WebRTCDataChannelClient = factory());
},
// Boilerplate for AMD, Node, and browser global
this
);
