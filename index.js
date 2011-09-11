var http = require('http');
var https = require('https');
var common = require('common');
var buffoon = require('buffoon');
var parseURL = require('url').parse;
var querify = require('querystring').stringify;

var noop = function() {};

var pipe = function(response, output, callback) {
	callback = callback || noop;
	
	response.on('end', callback);
	response.on('close', function() {
		callback(new Error('premature close'));
	});
	response.pipe(output);	
};

var Request = common.emitter(function(method, options) {
	this.readable = true;
	this.writable = true;

	this._lib = options.protocol === 'https:' ? https : http;

	this._options = {
		method:method,
		host:options.hostname,
		port:options.port
	};
	
	this._allowed = [];
	this._piping = false;
	this._checkStatus = true;
	this._headers = {};
	this._path = options.pathname || '/';
	this._query = options.search || '';
	this._req = null;
	this._onresponse = common.future();
});

Request.prototype.send = function(body, callback) {
	if (!callback) {
		callback = body;
		body = '';
	} else {
		body = this._encode(body);
		this._headers['content-length'] = this._headers['content-length'] || (Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body));
	}
	
	callback = callback || noop;

	var self = this;

	this._response(common.fork(callback, function(response) {
		self._decode(response, callback);
	}));
	
	if (!this._piping) {
		this.end(body);		
	}
	return this;
};
Request.prototype.json = function(json, callback) {
	this._encode = JSON.stringify;
	this._decode = buffoon.json;

	if (typeof json !== 'function') { // we have a body
		this._headers['content-type'] = this._headers['content-type'] || 'application/json';
	}
	return this._short(json, callback);
};
Request.prototype.form = function(data, callback) {
	this._encode = querify;

	if (typeof data !== 'function') {
		this._headers['content-type'] = this._headers['content-type'] || 'application/x-www-form-urlencoded';
	}
	return this._short(data, callback);
};
Request.prototype.buffer = function(buffer, callback) {	
	this._decode = buffoon.buffer;
	
	return this._short(buffer, callback);
};
Request.prototype.headers = function(headers, callback) {
	this._headers = headers;

	return this._short(callback);
};
Request.prototype.close = function(callback) {
	this._headers.connection = 'close';
	
	return this._short(callback);
};
Request.prototype.reuse = function(callback) {
	this._headers.connection = 'keep-alive';
	
	return this._short(callback);
};
Request.prototype.allow = function(status, callback) {
	this._allowed.push(status);
	return this._short(callback);
};
Request.prototype.query = function(query, callback) {
	query = querify(query);
	this._query = query && ('?'+query);
	return this._short(callback);
};
Request.prototype.path = function(path, callback) {
	this._path = path;
	return this._short(callback);
};
Request.prototype.from = function(input, callback) {
	this._piping = true;
	
	input.pipe(this._request());
	
	if (callback) {
		var self = this;
		
		this._response(common.fork(callback, function(response) {
			self._decode(response, callback);
		}));
	}
	return this;
};
Request.prototype.to = function(output, callback) {
	callback = callback || noop;
	
	this._response(common.fork(callback, function(response) {
		pipe(response, output, callback);
	}));
	
	if (!this._piping) {
		this.end();		
	}
	return this;
};
Request.prototype.pipe = Request.prototype.to;
Request.prototype.proxy = function(proxy, callback) {
	callback = callback || noop;

	this._checkStatus = false;
	this._response(function(err, response) {
		if (err) {
			proxy.connection.destroy(); // not sure about this				
			return;
		}
		proxy.writeHead(response.statusCode, response.headers);
		pipe(response, proxy, callback);
	});
	
	if (!this._piping) {
		this.end();
	}
	return this;
};

Request.prototype.write = function(data) {
	return this._request().write(data);
};
Request.prototype.end = function(data, callback) {
	if (typeof data === 'function') {
		callback = data;
		data = '';
	}
	this.end = noop;
	this._request().end(data);
	this.writable = false;

	if (callback) {
		this._response(callback);		
	}
	return this;
};
Request.prototype.pause = function() {
	this._response(common.fork(noop, function(response) {
		response.pause();
	}));
};
Request.prototype.resume = function() {
	this._response(common.fork(noop, function(response) {
		response.resume();
	}));
};
Request.prototype.destroy = function() {
	if (!this._req) {
		return;
	}
	this._req.abort();
};

Request.prototype._short = function(a,b) {
	return a ? this.send(a,b) : this;
};
Request.prototype._encode = function(a) { return a; };
Request.prototype._decode = buffoon.string;
Request.prototype._response = function(callback) {
	this._onresponse.get(callback);
};
Request.prototype._request = function() {
	if (!this._req) {
		var self = this;
		
		this._options.path = this._path + this._query;
		this._options.headers = this._headers;
		
		this._req = this._lib.request(this._options);
		this._req.on('drain', function() {
			self.emit('drain');
		});
		
		var onresponse = function(response) {
			var allowed = false;

			self.response = response;

			if (self._checkStatus && (/3\d\d/).test(response.statusCode) && response.headers.location) {
				var req = exports.get(response.headers.location).headers(self._headers);
				
				req._decode = self._decode;
				req.end();
				req.on('response', onresponse);
				return;
			}
			for (var i in self._allowed) {
				if (response.statusCode === self._allowed[i]) {
					allowed = true;
					break;
				}
			}
			if (self._checkStatus && !allowed && !(/2\d\d/).test(response.statusCode)) {
				var err = new Error('invalid status code: '+response.statusCode);

				err.statusCode = response.statusCode;
				self._onresponse.put(err);
				self.emit('response', response);
				return;
			}

			response.on('data', function(data) {
				self.emit('data', data);
			});
			response.on('end', function() {
				self.readable = false;
				self.emit('end');
			});
			response.on('close', function() {
				self.readable = false;
				self.emit('close');
			});
			
			self.emit('response', response);
			self._onresponse.put(null, response);
		};
		
		this._req.on('response', onresponse);
		this._req.on('error', this._onresponse.put);
	}
	return this._req;
};

['get', 'del', 'head', 'post', 'put'].forEach(function(m) {
	var method = m.replace('del', 'DELETE').toUpperCase();
	
	exports[m] = function(url, callback) {	
		if (url.indexOf('://') === -1) {
			url = 'http://'+url;
		}

		var args = typeof callback !== 'function' && arguments.length > 1 ? Array.prototype.slice.call(arguments, 1) : [];
		
		if (typeof args[args.length-1] === 'function') {
			callback = args.pop();
		}
		if (args.length) {
			args.unshift(url);
			url = common.format.apply(common, args);
		}

		var req = new Request(method, typeof url === 'string' ? parseURL(url) : url);
		
		if (typeof callback === 'function') {
			req.send(callback);
		}
		
		return req.reuse();
	};
});
