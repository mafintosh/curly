var curly = require('./index');

var file = require('fs').createReadStream(__filename);

curly.post('http://localhost:12345/echo')
	.headers({'x-ian':'hello'})
	.from(file)
	.to(process.stdout);

//curly.get('http://localhost:12345/query').proxy(response);