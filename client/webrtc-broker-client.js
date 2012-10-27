(function(define, global) { 'use strict';
define(['module'], function(module) {

  function Offer(url, optMetadata, optExpires) {
    var offer = this;
    this.oncomplete = null;
    this.onerror = null;

    var xhr;
    if(true) {
      // TODO: start setting up this side of the peer connection
      xhr = new XMLHttpRequest();
      xhr.open('POST', url + '/offer');
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function() {
        if(4 !== xhr.readyState) {
          return;
        }
        if(201 === xhr.status) {
          var response = JSON.parse(xhr.responseText);
          offer.id = response.id;
          var answer = new EventSource(url + '/offer/' + offer.id + '/answer');
          answer.onmessage = function(e) {
            console.log(e.data);
            answer.close();
            // TODO: finish setting up this side of the peer connection
            if(this.onerror && 'function' === typeof this.oncomplete) {
              this.oncomplete.call(this, {/*peer connection*/});
            }
          };
          answer.onerror = function(e) {
            if(this.onerror && 'function' === typeof this.onerror) {
              this.onerror.call(this, e);
            }
          };
        } else {
          if(this.onerror && 'function' === typeof this.onerror) {
            this.onerror.call(this, xhr.statusText);
          }
        }
      };
      xhr.send(JSON.stringify({offer: "sdp"}));
    } else {

    }
  }

  return {
    Offer: Offer
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