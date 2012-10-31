(function(define, global) { 'use strict';
define(['module'], function(module) {

  function Offer(url, optMetadata, optExpires) {
    var offer = this;
    this.onpending = null;
    this.oncomplete = null;
    this.onerror = null;
    this.id = undefined;
    this.pc = new mozRTCPeerConnection();

    function fail(error) {
      if(offer.onerror && 'function' === typeof offer.onerror) {
        if (!(error instanceof Error))
          error = new Error(error);
        offer.onerror.call(null, error);
      }
    }

    //XXX: This is a hack until RTCPeerConnection provides API for
    // adding a network flow for DataChannels
    navigator.mozGetUserMedia({audio: true, fake: true}, function(stream) {
      // Now we have a fake stream.
      offer.pc.addStream(stream);
      offer.pc.createOffer(function(rtc_offer) {
        // Now we have an offer SDP to give.
        var xhr = new XMLHttpRequest();
        xhr.open('POST', url + '/offer');
        xhr.setRequestHeader('content-type', 'application/json');
        xhr.onreadystatechange = function() {
          if(4 !== xhr.readyState) {
            return;
          }
          if(201 === xhr.status) {
            var response = JSON.parse(xhr.responseText);
            offer.id = response.id;
            if(offer.onpending && 'function' === typeof offer.onpending) {
              offer.onpending.call(null, url + '/offer/' + offer.id);
            }
            var answer = new EventSource(url + '/offer/' + offer.id + '/answer');
            answer.onmessage = function(e) {
              answer.close();
              // Now we have the answer SDP from the other end, so
              // set it as the remote description.
              var rtc_answer = {'type':'answer', 'sdp': JSON.parse(e.data).value};
              offer.pc.setRemoteDescription(rtc_answer, function() {
                // Now the remote description is set.
                if(offer.oncomplete && 'function' === typeof offer.oncomplete) {
                  offer.oncomplete.call(null, offer.pc);
                }
              },
                                            function(err) { fail(err); });
            };
            answer.onerror = function(e) {
              if (e.readyState == EventSource.CLOSED) {
                // Connection was closed.
                return;
              }
              if(offer.onerror && 'function' === typeof offer.onerror) {
                offer.onerror.call(null, e);
              }
            };
          } else {
            if(offer.onerror && 'function' === typeof offer.onerror) {
              offer.onerror.call(null, new Error(xhr.statusText));
            }
          }
        };
        xhr.send(JSON.stringify({offer: rtc_offer.sdp}));
      },
                           function(err) { fail(err); },
                           //XXX: constraints should be optional
                           {mandatory: {}, optional: []});
    }, function(err) { fail(err); });
  }

  function Answer(url) {
    var answer = this;
    this.oncomplete = null;
    this.onerror = null;

    function fail(error) {
      if(answer.onerror && 'function' === typeof answer.onerror) {
        if (!(error instanceof Error))
          error = new Error(error);
        answer.onerror.call(null, error);
      }
    }

    var getXhr = new XMLHttpRequest();
    getXhr.open('GET', url + '/offer');
    getXhr.onreadystatechange = function() {
      if(4 !== getXhr.readyState) {
        return;
      }
      if(200 === getXhr.status) {
        var response = JSON.parse(getXhr.responseText);
        var offer = {'type': 'offer', 'sdp': response.value};
        answer.pc = new mozRTCPeerConnection();

        //XXX: This is a hack until RTCPeerConnection provides API for
        // adding a network flow for DataChannels
        navigator.mozGetUserMedia({audio: true, fake: true}, function(stream) {
          // Now we have a fake stream.
          answer.pc.addStream(stream);
          answer.pc.setRemoteDescription(offer, function() {
            // Now the remote description is set.
            answer.pc.createAnswer(function(rtc_answer) {
              // Now we have an answer SDP to give.
              // First set it as local description.
              answer.pc.setLocalDescription(rtc_answer, function() {
                // Now the local description is set, so pass the answer
                // SDP back to the broker.
                var postXhr = new XMLHttpRequest();
                postXhr.open('POST', url + '/answer');
                postXhr.setRequestHeader('content-type', 'application/json');
                postXhr.onreadystatechange = function() {
                  if(4 !== postXhr.readyState) {
                    return;
                  }
                  if(200 === postXhr.status) {
                    if(answer.oncomplete && 'function' === typeof answer.oncomplete) {
                      answer.oncomplete.call(null, answer.pc);
                    }
                  } else {
                    if(answer.onerror && 'function' === typeof answer.onerror) {
                      answer.onerror.call(null, new Error(postXhr.statusText));
                    }
                  }
                };
                postXhr.send(JSON.stringify({value: rtc_answer.sdp}));
              }, function(err) { fail(err); });
            }, function(err) { fail(err); },
                                   //XXX: constraints should be optional
                                   {mandatory: {}, optional: []}, false);
          },
                                         function(err) { fail(err); });
        }, function(err) { fail(err); });
      } else {
        if(answer.onerror && 'function' === typeof answer.onerror) {
          answer.onerror.call(null, new Error(getXhr.statusText));
        }
      }
    };
    getXhr.send(null);
  }

  return {
    Offer: Offer,
    Answer: Answer
  };

});
})(typeof define == 'function' && define.amd
? define
: function (deps, factory) { typeof exports === 'object'
? (module.exports = factory())
: (this.WebRTCBrokerClient = factory());
},
// Boilerplate for AMD, Node, and browser global
this
);