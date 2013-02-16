function log(msg) {
  console.log(msg);
  document.getElementById("chat").appendChild(document.createTextNode(msg + "\n"));
}

var brokerSession = null;
var brokerUrl = 'http://localhost:3000';
var hosting = true;
var options;

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
var peer = new RTCPeer(brokerUrl);
peer.onconnect = function(connection) {
  log('connected');
  conn = connection;
  conn.ondisconnect = function() {
    log('disconnected');
  };
  conn.onerror = function(error) {
    console.error(error);
  };

  conn.reliable.onmessage = function(msg) {
    log("<other> " + msg.data);
  };

  var div = document.getElementById('host');
  div.innerHTML = '';
};
var conn = null;

if(hosting) {  
  options = {
    'application': 'data-demo'
  };
  peer.onready = function() {
    console.log('ready');

    peer.host(options);
  };
  peer.onhost = function(sid) {
    console.log('hosting');

    var location = window.location.toString().split('?');
    location[1] = location[1] || '';
    var params = location[1].split('&');    
    params.push('webrtc-session=' + sid);
    location[1] = params.join('&');
    var url = location.join('?');

    var div = document.getElementById('host');
    div.innerHTML = '<a href="' + url + '">connect</a>';
  }
} else {
  peer.connect(brokerSession);
}

window.onbeforeunload = function() {
  if(conn && conn.connected) {
    conn.close();
  }
};

document.getElementById("chatinput").addEventListener("keyup", function(e) {
  if (conn && e.keyCode == 13 && conn.connected) {
    var ci = document.getElementById("chatinput");
    log("<self> " + ci.value);
    conn.reliable.send(ci.value);
    ci.value = "";
  }
});
