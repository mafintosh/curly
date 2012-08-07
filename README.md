# curly

An extendable request module for node.js and the browser.
It's available through npm

	npm install curly

The goal of this module is to bring the core power of [request](https://github.com/mikeal/request) to both the browser and to Node combined with an extension interface to make client implementations of REST APIs simple.

## Usage:

Core usage is almost identical to [request](https://github.com/mikeal/request)

``` js
var curly = require('curly');

curly('http://google.com', callback); // callback is called with (err, response, body)
curly.get('http://google.com', callback); // above is sugar for this

curly('http://google.com', {hello:'world'}, callback);

// we expect a JSON callback
curly('https://some-json-service.com', {json:true, query:{meh:'bar'}}, callback);

// send some custom headers
curly('http://google.com', {headers:{'user-agent':'curly'}}, callback);

// streaming! (only works in Node)
inputStream.pipe(curly.put('http://file-upload-service.com/meh')).pipe(outputStream);
```

## Extensions

The real power of curly lies in its extension interface. If you want to implement a REST API simply use the `use` method to extend curly.

``` js
var curly = require('curly');
var myapi = curly.use(function(options) {
	options.url = 'http://myapi.com'+options.url;

	var req = curly(options);
	
	req.once('open', function() {
		// this function is called just before the request is started
		req.setHeader('Authorization', 'some signing stuff here');
	});
	return req;
});

myapi('/hello', function(err, res, body) {
	// this request went to 'http://myapi.com/hello'
});
```

## Browser usage

Curly (with the exception of streaming) works in the browser as well. `browser.js` exposes a `common.js` browserbased version.
Using a tool like [browserify](https://github.com/substack/node-browserify) you should be able to just `var curly = require('curly')`.

## License

**This software is licensed under "MIT"**

> Copyright (c) 2012 Mathias Buus Madsen <mathiasbuus@gmail.com>
> 
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
> 
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
> 
> THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.