var _ = require('underscore');
var crypto = require('crypto');
var url = require('url');
var querystring = require('querystring');

function mkguid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  }).toUpperCase();
};

function mksecret() {
	return Math.random().toString(36).substr(2);
};

function mksseevt(type, data) {
	return 'event: ' + type + '\ndata: ' + JSON.stringify(data) + '\n\n';
}

function mkssehdr() {
	return {'content-type': 'text/event-stream', 'cache-control': 'no-cache'};
}

var channels = {};
var sessions = {};

function tocid(id) {
	if(channels.hasOwnProperty(id)) {
		return id;
	} else if(sessions.hasOwnProperty(id)) {
		return sessions[id].cid;
	} else {
		return undefined;
	}
}

exports.channel = function channel(req, res) {
	var accepts = req.headers['accept'];
	if(!'text/event-stream' === accepts) {
		res.send(400, 'client must accept text/event-stream');
	}

	var cid = mkguid();
	var key = mksecret();	

	var channel = {
		res: res,
		key: key,
		sessions: []
	};
	res.connection.setTimeout(0);
	res.on('close', function onclose() {
		var channel = channels[cid];
		channel['sessions'].forEach(function(sid) {
			delete sessions[sid];
		});
		delete channels[cid];
	});

	channels[cid] = channel;

	res.writeHead(201, mkssehdr());
	res.write(mksseevt('channel', 
		{'cid': cid, 
		 'key': key}
	));

	return;
};

exports.list = function list(req, res) {
	var application = req.query['application'];

	var result = [];
	Object.keys(sessions).forEach(function(sid) {
		var session = sessions[sid];		
		if(application && application !== session['application']) return;

		var clientUrl = url.parse(session['url'], true);
	  clientUrl.query['webrtc-session'] = sid;
	  clientUrl.search = querystring.unescape(querystring.stringify(clientUrl.query));
	  clientUrlString = url.format(clientUrl);

		result.push({
			'url': clientUrlString,
			'application': session['application'],
			'authenticate': session['authenticate'],
			'tags': session['tags'],
			'metadata': session['metadata'],
			'created': session['created']
		});  	
	});
	res.send(200, JSON.stringify(result));
};

exports.show = function show(req, res) {
	var sid = req.params['sid'];

	if(!sessions.hasOwnProperty(sid)) {
		return res.send(404, 'session not found');
	}

	var session = sessions[sid];

	var clientUrl = url.parse(session['url'], true);
  clientUrl.query['webrtc-session'] = sid;
  clientUrl.search = querystring.unescape(querystring.stringify(clientUrl.query));
  clientUrlString = url.format(clientUrl);

  var result = '';
  result += 'url: <a href="' + clientUrlString + '">' + clientUrlString + '</a><br>';
  result += 'application: ' + session['application'] + '<br>';
  result += 'list: ' + session['list'] + '<br>';
  result += 'authenticate: ' + session['authenticate'] + '<br>';
  result += 'tags: ' + JSON.stringify(session['tags']) + '<br>';
  result += 'metadata: ' + JSON.stringify(session['metadata']) + '<br>';
  result += 'created: ' + (new Date(session['created'])).toString() + '<br>';

	return res.send(200, result);
};

exports.session = function session(req, res) {
	var body = req.body;	

	if(!body['cid']) {
		return res.send(400, 'missing host');
	}
	if(!body['key']) {
		return res.send(400, 'missing key');
	}

	var cid = body['cid'];
	var key = body['key'];
	if(!channels.hasOwnProperty(cid) || key !== channels[cid]['key']) {
		return res.send(400, 'invalid cid or key');
	}

	if(!body['url']) {
		return res.send(400, 'missing url');
	}

	var sid = mkguid();

	var session = {
		cid: cid,
		url: body['url'],
		application: (body['application'] === undefined) ? '?' : body['application'],
		list: (body['list'] === undefined) ? false : body['list'],
		authenticate: (body['authenticate'] === undefined) ? false : body['authenticate'],
		tags: (body['tags'] === undefined) ? [] : body['tags'],
		metadata: (body['metadata'] === undefined) ? {} : body['metadata'],
		created: Date.now()
	};

	channels[cid]['sessions'].push(sid);
	sessions[sid] = session;

	return res.send(201, JSON.stringify(
		{'sid': sid}
	));
};

exports.update = function update(req, res) {
	var body = req.body;

	if(!body['cid']) {
		return res.send(400, 'missing host');
	}
	if(!body['key']) {
		return res.send(400, 'missing key');
	}

	var cid = body['cid'];
	var key = body['key'];
	if(!channels.hasOwnProperty(cid) || key !== channels[cid]['key']) {
		return res.send(400, 'invalid cid or key');
	}

	var channel = channels[cid];
	var sid = req.params['sid'];
	if(!sid in channel.sessions) {
		return res.send(404, 'session not found');
	}

	body['tags'] === undefined ? [] : body['tags'];
	body['list'] === undefined ? false : body['list'];
	body['metadata'] === undefined ? {} : body['metadata'];

	var session = sessions[sid];

	session['tags'] = body['tags'];
	session['list'] = body['list'];
	session['metadata'] = body['metadata'];

	return res.send(200, 'OK');
};

exports.send = function send(req, res) {
	var body = req.body;

	var target_id = tocid(req.params['id']);
	if(undefined === target_id) {
		return res.send(404, 'channel not found');
	}
	
	if(!body['origin']) {
		return res.send(400, 'missing origin');
	}
	if(!body['key']) {
		return res.send(400, 'missing key');
	}

	var origin_cid = body['origin'];
	var key = body['key'];
	if(!channels.hasOwnProperty(origin_cid) || key !== channels[origin_cid]['key']) {
		return res.send(400, 'invalid origin or key');
	}

	var channel = channels[target_id];
	var message = {
		'origin': origin_cid,
		'target': target_id,
		'message': body['message']
	};

	channel.res.write(mksseevt('message', message));

	return res.send(200, 'OK');
};