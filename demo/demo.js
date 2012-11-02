var broker = "http://webrtc-broker.herokuapp.com";
var dc = null;
try {
  var id = null;
  if (window.location.search) {
    // Given an ID, answer the offer.
    var params = window.location.search.substring(1).split("&");
    for (var i=0; i<params.length; i++) {
      if (params[i].match("^id=")) {
        id = params[i].substring(3);
      }
    }
  }
  if (id) {
    document.getElementById('stdout').innerHTML = "Answering offer...";
    var Answer = WebRTCPeer.Answer;
    var answer = new Answer(broker + "/offer/" + id);
    answer.oncomplete = function(pc) {
      console.log("answer connection");
      document.getElementById('stdout').innerHTML = "Ready to connect";
      // Connect up some event listeners.
      pc.onconnection = function() {
        document.getElementById('stdout').innerHTML = "PeerConnection connected!";
      };
      pc.ondatachannel = function(channel) {
        dc = channel;
        document.getElementById('stdout').innerHTML = "datachannel connected!";
        dc.binaryType = "blob";
        channel.onmessage = function(event) {
          console.log("dc message: " + event.data);
        };
      };

      //XXX: this is a hack until the DataChannel APIs are finalized.
      pc.connectDataConnection(5001,5000);
    };
    answer.onerror = function(e) {
      console.error(e);
      document.getElementById('stdout').innerHTML = "Error connecting. Is this a valid URL?";
    };
  } else {
    // New session, make an offer.
    var Offer = WebRTCPeer.Offer;
    var offer = new Offer(broker);
    offer.onpending = function(url) {
      document.getElementById('stdout').innerHTML = "Offer sent. Load the current URL in a new tab.";
      console.log("Made Offer: " + url);
      history.pushState({}, "", "?id=" + offer.id);
    };
    offer.oncomplete = function(pc) {
      console.log("offer connection");
      document.getElementById('stdout').innerHTML = "Ready to connect";
      pc.onconnection = function() {
        document.getElementById('stdout').innerHTML = "PeerConnection connected!";
        dc = pc.createDataChannel("main", {}); // reliable (TCP-like)
        // Can also do:
        // dc = pc.createDataChannel("something", {outOfOrderAllowed: true, maxRetransmitNum: 0}); // unreliable (UDP-like)
        dc.binaryType = "blob";

        dc.onmessage = function(event) {
          console.log("dc message: " + event.data);
        };
      };
      //XXX: this is a hack until the DataChannel APIs are finalized.
      pc.connectDataConnection(5000,5001);
    };
    offer.onerror = function(e) {
      console.error(e);
    };
  }
} catch(e) {
  console.error(e);
}
