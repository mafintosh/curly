# curly

a request module for node.js using cascading syntax  
it's available through npm

	npm install curly
	
more examples are coming but curly just exposes all the http methods and you config it using cascades.

``` js
var curly = require('curly');

curly.get('http://google.com', callback);
curly.get('http://google.com').send(callback); // above is sugar for this

curly.get('http://google.com').query({hello:'world'}, callback); // adds a query string
curly.get('https://some-json-service.com').reuse().query({meh:'bar'}).json(callback); // reuse means adding keep-alive and we expect json back
```

to use custom headers use the `headers` function

``` js
curly.get('http://google.com').headers({'user-agent':'curly'}, callback);
curly.get('http://google.com').headers({'user-agent':'curly'}).buffer(callback); // let's get is as a buffer
```

curly can also stream and pipe

``` js
curly.put('http://file-upload-service.com/meh').from(inputStream).pipe(outputStream);
```

`pipe` is also aliased to `to` for consistency with `from`. the above methods can ofcourse be chained with any of the other events.  

besides `put` and `get` curly supports `post`, `del` and `head`.  
the object returned from any of the methods is also an `EventEmitter` and emits `response`, `data`,`close` and `end` events.

``` js
var req = curly.get('http://google.com').end().on('response', function(response) {
	console.log('here we have the classic response - also available through req.response');
});
```

the above could also be expressed as

``` js
var req = curly.get('http://google.com').end(function(err, response) {
	console.log('now we have error handling');
});
```