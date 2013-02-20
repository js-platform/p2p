function log(msg) {
  console.log(msg);
  document.getElementById("chat").appendChild(document.createTextNode(msg + "\n"));
}

/*
var localvideo = document.getElementById("local");
var remotevideo = document.getElementById("remote");
*/

function bindStream(stream, element) {
  if ("mozSrcObject" in element) {
    element.mozSrcObject = stream;
  } else {
    element.src = webkitURL.createObjectURL(stream);
  }
  element.play();
};

var brokerSession = null;
var brokerUrl = 'http://wrtcb.jit.su';
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
var peer = new RTCPeer(brokerUrl, {video: false, audio: false});
var connections = {};
peer.onconnect = function(connection) {
  log('connected');
  connections[connection.id] = connection;
  connection.ondisconnect = function() {
    log('disconnected');
    delete connections[connection.id];
  };
  connection.onerror = function(error) {
    console.error(error);
  };

  //bindStream(connection.streams['local'], localvideo);
  //bindStream(connection.streams['remote'], remotevideo);

  connection.reliable.onmessage = function(msg) {
    log('<other:' + connection.id + '> ' + msg.data);
  };
};
peer.onerror = function(error) {
  console.error(error.stack);
};

if(hosting) {
  peer.listen();

  console.log('hosting');

  peer.onroute = function(route) {
    var url = window.location.toString().split('?');
    url[1] = url[1] || '';
    var params = url[1].split('&');
    params.push('webrtc-session=' + route);
    url[1] = params.join('&');

    var div = document.getElementById('host');
    div.innerHTML = '<a href="' + url.join('?') + '">connect</a>';
  }
} else {
  peer.connect(brokerSession);
}

window.onbeforeunload = function() {
  var ids = Object.keys(connections);
  ids.forEach(function(id) {
    connections[id].close();
  });
};

document.getElementById("chatinput").addEventListener("keyup", function(e) {
  if (e.keyCode == 13) {
    var ci = document.getElementById("chatinput");
    log("<self> " + ci.value);

    var ids = Object.keys(connections);
    ids.forEach(function(id) {
      connections[id].reliable.send(ci.value);
    });

    ci.value = "";
  }
});
