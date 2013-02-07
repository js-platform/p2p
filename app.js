
/**
 * Module dependencies.
 */

var express = require('express')
  , fs = require('fs')  
  , https = require('https')
  , http = require('http')
  , path = require('path')
  , routes = require('./routes')
  , broker = require('./routes/broker')
  ;

var app = express();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

app.all('*', function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'PUT, GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  // intercept OPTIONS method
  if ('OPTIONS' == req.method) {
    res.send(200);
  }
  else {
    next();
  }
});

app.get('/channel', broker.channel);
app.get('/list', broker.list);
app.get('/session/:sid', broker.show);
app.post('/session', broker.session);
app.post('/session/:sid/update', broker.update);
app.post('/send/:id', broker.send);
app.post('/ping', broker.ping);

var httpsOptions = {
  key: fs.readFileSync('./ssl/localhost.key'),
  cert: fs.readFileSync('./ssl/localhost.crt')
};

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});