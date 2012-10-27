var offers = {};

function guid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
    return v.toString(16);
  }).toUpperCase();
}

exports.read = function(req, res){
  var id = req.params.id;
  if(offers.hasOwnProperty(id)) {
    return res.send(200, {offer: offers[id]});
  } else {
    return res.send(404, {error: 'offer not found'});
  }
};

exports.create = function(req, res) {
  var body = req.body;
  if(!body.hasOwnProperty('sdp')) {
    return res.send(400, 'missing field');
  }
  var id = guid();
  offers[id] = body.sdp;
  return res.send(201, {id: id});
};