var curly = require('./index');

curly.get('http://api.geonames.org/citiesJSON', {
	json:true,
	query:{north:'44.1',south:'-9.9', east:'-22.4', west:'55.2', lang:'de', username:'demo'}
}, function(err, res, body) {
	console.log(res.body);
});