function log(msg) {
  console.log(msg);
  document.getElementById("chat").appendChild(document.createTextNode(msg + "\n"));
}

var brokerSession = null;
var brokerUrl = 'http://modeswit.ch:3000';
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
var conn = undefined;

var Query = {
  parse: function parse(queryString) {
    var result = {};
    var parts = (undefined !== queryString) ? queryString.split('&') : [];
    parts.forEach(function(part) {
      var key = part.split('=')[0];
      if(!result.hasOwnProperty(key))
        result[key] = [];
      var value = part.split('=')[1];
      if(undefined !== value)
        result[key].push(value);
    });
    return result;
  },
  defined: function defined(params, key) {
    return (params.hasOwnProperty(key));
  },
  stringify: function stringify(params) {
    var result = [];
    Object.keys(params).forEach(function(param) {
      var key = param;
      var values = params[key];
      if(values.length > 0) {
        values.forEach(function(value) {
          result.push(key + '=' + value);
        });
      } else {
        result.push(key);
      }
    });
    return result.join('&');
  }
};

function babble() {
  setInterval(function() {conn.reliable.channel.send('X');}, 4000);
}

if(hosting) {  
  options = {
    'session': {
      'application': 'data-demo'
    }
  };
  var host = new WebRTC.Host(brokerUrl, options);
  host.onready = function(sid) {
    console.log('ready');
    var location = window.location.toString().split('?');
    var params = Query.parse(location[1]);
    params['webrtc-session'] = [sid];
    location[1] = Query.stringify(params);
    var url = location.join('?');

    var div = document.getElementById('host');
    div.innerHTML = '<a href="' + url + '">connect</a>';
  };
  host.onconnect = function() {
    log('connected');
    conn = host;
    conn.reliable.onmessage = function(msg) {
      log("<other> " + msg.data);
    };

    var div = document.getElementById('host');
    div.innerHTML = '';
  };
  host.onerror = function(error) {
    console.error(error);
  };  
} else {
  options = {};
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

window.onbeforeunload = function() {
  if(conn.connected) {
    conn.close();
  }
};

document.getElementById("chatinput").addEventListener("keyup", function(e) {
  if (conn && e.keyCode == 13 && conn.connected) {
    var ci = document.getElementById("chatinput");
    log("<self> " + ci.value);
    conn.reliable.channel.send(ci.value);
    ci.value = "";
  }
});
