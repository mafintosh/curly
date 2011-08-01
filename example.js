var curly = require('./index');

curly.get('http://api.geonames.org/citiesJSON')
	.headers({'x-meh':'hello'})
	.query({north:'44.1',south:'-9.9', east:'-22.4', west:'55.2', lang:'de', username:'demo'})
	.json(console.log);