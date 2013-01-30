function log(msg) {
  console.log(msg);
  document.getElementById("chat").appendChild(document.createTextNode(msg + "\n"));
}

var brokerSession = null;
var brokerUrl = 'http://webrtc-broker.herokuapp.com';
var hosting = true;
var options = {};

if(window.location.search) {
  var params = window.location.search.substring(1).split('&');
  for(var i = 0; i < params.length; ++ i) {
    if(params[i].match('^webrtc-session')) {
      brokerSession = params[i].split('=')[1];
      hosting = false;
    } else if(params[i].match('^webrtc-broker')) {
      brokerUrl = params[i].split('=')[1];
    }
  }
}

console.log('broker', brokerUrl);
var conn = undefined;

if(hosting) {  
  var host = new WebRTC.Host(brokerUrl, options);
  host.onready = function(sid) {  
    var url = window.location + '&webrtc-session=' + sid;
    console.log(url);
    var div = document.getElementById("host");
    if(div) {
      div.innerHTML = '<a href="' + url + '">Open remote client</a>';
    }
  };
  host.onconnect = function() {
    log('connected');
    conn = host;
    conn.reliable.onmessage = function(msg) {
      log("<other> " + msg.data);
    };
  };
  host.onerror = function(error) {
    console.error(error);
  };  
} else {
  var peer = new WebRTC.Peer(brokerUrl, brokerSession, options);
  peer.onconnect = function() {
    log('connected');
    conn = peer;
    conn.reliable.onmessage = function(msg) {
      log("<other> " + msg.data);
    };
  };
  peer.onerror = function(error) {
    console.error(error);
  };
}

document.getElementById("chatinput").addEventListener("keyup", function(e) {
  if (conn && e.keyCode == 13 && conn.connected) {
    var ci = document.getElementById("chatinput");
    log("<self> " + ci.value);
    conn.reliable.channel.send(ci.value);
    ci.value = "";
  }
});
