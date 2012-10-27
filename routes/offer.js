var OFFER_SDP = "offer_sdp";
var ANSWER_SDP = "answer_sdp";

var offers = {};

function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  }).toUpperCase();
}

exports.get = function(req, res){
  var id = req.params.id;
  var field = req.params.field;
  console.log(id, field);
  if(!offers.hasOwnProperty(id)) {
    return res.send(404, {error: 'offer not found'});
  } else {
    var offer = offers[id];
    if(field) {
      if(!offer.hasOwnProperty(field)) {
        return res.send(404, {error: 'field not found'});
      } else {
        res.set('Content-Type', 'text/plain');
        if(offer.hasOwnProperty(ANSWER_SDP)) {
          delete offers[id];
        }
        return res.send(200, offer[field]);
      }
    } else {
      if(offer.hasOwnProperty(ANSWER_SDP)) {
        delete offers[id];
      }
      return res.send(200, offers[id]);
    }    
  }
};

exports.post = function(req, res) {
  var id = req.params.id;
  var field = req.params.field;
  var body = req.body;
  if(!id) {
    if(!body.hasOwnProperty(OFFER_SDP)) {
      return res.send(400, 'missing required field');
    }
    var id = "B4140ED7-5529-422C-BE57-E5727B25E7D6"; //guid();
    offers[id] = {};
    offers[id][OFFER_SDP] = body[OFFER_SDP];
    return res.send(201, {id: id});
  } else {
    if(!offers.hasOwnProperty(id)) {
      return res.send(404, {error: 'offer not found'});
    }
    var offer = offers[id];
    if(offer.hasOwnProperty(ANSWER_SDP)) {
      return res.send(400, {error: 'offer already answered'});
    }
    if(!field) {
      var fields = Object.keys(body);
      fields.forEach(function(field) {
        if(offer.hasOwnProperty(field)) {
          return res.send(400, {error: 'field already exists'});
        }
      });
      fields.forEach(function(field) {
        offer[field] = body[field];
      });
      return res.send(200, 'ok');
    } else {
      if(offer.hasOwnProperty(field)) {
        return res.send(400, {error: 'field already exists'});
      }
      offer[field] = body;
      return res.send(200, 'ok');
    }
  }
};

exports.delete = function(req, res) {
  var id = req.params.id;
  if(!id) {
    return res.send(404, {error: 'offer not found'});
  }
  delete offers[id];
  return res.send(200, 'ok');
}