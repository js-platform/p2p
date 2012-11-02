function log(msg) {
  console.log(msg);
  document.getElementById("chat").appendChild(document.createTextNode(msg + "\n"));
}

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
var conn = null;
if (id) {
  // Connect to an existing connection.
  console.log("Connecting to " + id);
  conn = new WebRTCPeer.DataPeer(null, id);
} else {
  // Initiate a connection.
  console.log("Creating new offer");
  conn = new WebRTCPeer.DataPeer();
  conn.onoffercreated = function(url, offer_id) {
    log("Made offer");
    console.log("Made offer: " + url);
    history.pushState({}, "", "?id=" + offer_id);
  };
}
conn.onconnect = function() {
  log("Connected!");
};
conn.onerror = function(e) {
  log("Error: " + e);
}
conn.onreliablemessage = function(msg) {
  log("<other> " + msg.data);
};
document.getElementById("chatinput").addEventListener("keyup", function(e) {
  if (e.keyCode == 13 && conn.connected) {
    var ci = document.getElementById("chatinput");
    log("<self> " + ci.value);
    conn.reliable.send(ci.value);
    ci.value = "";
  }
});
