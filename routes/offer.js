var _ = require('lodash');

var FIELDS = [
  'offer',
  'answer',
  'metadata',
  'expires'
];

var offers = {};
var watchers = {};

function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  }).toUpperCase();
}

exports.get = function(req, res){
  var id = req.params.id;
  var field = req.params.field;
  if(!offers.hasOwnProperty(id)) {
    return res.send(404, {error: 'offer not found'});
  } else {
    var offer = offers[id];
    if(field) {
      if('answer' === field && 'text/event-stream' === req.headers['accept'] && !watchers.hasOwnProperty(offer.id)) {
        res.writeHead(200, {
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          'connection': 'keep-alive'
        });      
        if(offer.hasOwnProperty('answer')) {
          res.write('data: ' + JSON.stringify({value: offer['answer']}) + '\n\n');
        } else {
          watchers[id] = res;
          res.on('close', function() {
            delete watchers[id];
          });
        }
        return;
      }
      if(!offer.hasOwnProperty(field)) {
          return res.send(404, {error: 'field not found'});
      } else {
        if(offer.hasOwnProperty('answer')) {
          delete offers[id];
        }
        return res.send(200, {value: offer[field]});
      }
    } else {
      if(offer.hasOwnProperty('answer')) {
        delete offers[id];
      }
      return res.send(200, offer);
    }    
  }
};

exports.post = function(req, res) {
  var id = req.params.id;
  var field = req.params.field;
  var body = req.body;
  if(!id) {
    if(!body.hasOwnProperty('offer')) {
      return res.send(400, 'missing required field');
    }
    var id = guid();
    var offer = offers[id] = {};
    var fields = Object.keys(body);
    fields.forEach(function(field) {
      if(!_(FIELDS).contains(field)) {
        return res.send(400, {error: 'invalid field'});
      }
    });
    fields.forEach(function(field) {
      offer[field] = body[field];
    });
    return res.send(201, {id: id});
  } else {
    if(!offers.hasOwnProperty(id)) {
      return res.send(404, {error: 'offer not found'});
    }
    var offer = offers[id];
    if(offer.hasOwnProperty('answer')) {
      return res.send(400, {error: 'offer already answered'});
    }
    if(!field) {
      var fields = Object.keys(body);
      fields.forEach(function(field) {
        if(!_(FIELDS).contains(field)) {
          return res.send(400, {error: 'invalid field'});
        }
        if(offer.hasOwnProperty(field)) {
          return res.send(400, {error: 'field already exists'});
        }
      });
      fields.forEach(function(field) {
        offer[field] = body[field];
      });      
      if(_(fields).contains('answer') && watchers.hasOwnProperty(id)) {
        var watcher = watchers[id];
        watcher.write('data: ' + JSON.stringify({value: offer['answer']}) + '\n\n');
      }
      return res.send(200);
    } else {
      if(!_(FIELDS).contains(field)) {
        return res.send(400, {error: 'invalid field'});
      }
      if(offer.hasOwnProperty(field)) {
        return res.send(400, {error: 'field already exists'});
      }
      offer[field] = body['value'];
      if('answer' === field && watchers.hasOwnProperty(id)) {
        var watcher = watchers[id];
        watcher.write('data: ' + JSON.stringify({value: offer['answer']}) + '\n\n');       
      }
      return res.send(200);
    }
  }
};

exports.delete = function(req, res) {
  var id = req.params.id;
  if(!id) {
    return res.send(404, {error: 'offer not found'});
  }
  delete offers[id];
  return res.send(200);
}