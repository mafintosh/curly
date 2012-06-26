var curly = require('./index');

curly.get('http://api.geonames.org/citiesJSON', {
	json:true,
	query:{north:'44.1',south:'-9.9', east:'-22.4', west:'55.2', lang:'de', username:'demo'}
}, function(err, res, body) {
	console.log(res.body);
});

var geonames = curly.use(function(options, send) {
	options.url = 'http://api.geonames.org'+options.url;
	options.json = true;
	options.query = options.query || {};
	options.query.username = 'demo';
	options.query.lang = 'de';
	return send(options);
});

geonames('/citiesJSON', {query:{north:'44.1',south:'-9.9', east:'-22.4', west:'55.2'}}, function(err, res, body) {
	console.log(body);
});