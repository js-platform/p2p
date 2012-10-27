(function(define, global) { 'use strict';
define(['module'], function(module) {

  function Offer(url, optMetadata, optExpires) {
    var offer = this;
    this.onpending = null;
    this.oncomplete = null;
    this.onerror = null;
    this.id = undefined;

    // TODO: start setting up this side of the peer connection
    var offerSdp = 'offer-sdp';

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
          var answerSdp = JSON.parse(e.data).value;
          // TODO: finish setting up this side of the peer connection
          if(offer.oncomplete && 'function' === typeof offer.oncomplete) {
            offer.oncomplete.call(null, {/*peer connection*/});
          }
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
    xhr.send(JSON.stringify({offer: offerSdp}));
  }

  function Answer(url) {
    var answer = this;
    this.oncomplete = null;
    this.onerror = null;

    var getXhr = new XMLHttpRequest();
    getXhr.open('GET', url + '/offer');
    getXhr.onreadystatechange = function() {
      if(4 !== getXhr.readyState) {
        return;
      }
      if(200 === getXhr.status) {
        var response = JSON.parse(getXhr.responseText);
        var offerSdp = response.value;
        // TODO: set up this side of the peer connection
        var answerSdp = 'answer-sdp';

        var postXhr = new XMLHttpRequest();
        postXhr.open('POST', url + '/answer');
        postXhr.setRequestHeader('content-type', 'application/json');
        postXhr.onreadystatechange = function() {
          if(4 !== postXhr.readyState) {
            return;
          }
          if(200 === postXhr.status) {
            if(answer.oncomplete && 'function' === typeof answer.oncomplete) {
              answer.oncomplete.call(null, {/*peer connection*/});
            }
          } else {
            if(answer.onerror && 'function' === typeof answer.onerror) {
              answer.onerror.call(null, new Error(postXhr.statusText));
            }
          }
        };
        postXhr.send(JSON.stringify({value: answerSdp}));
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