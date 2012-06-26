var Stream   = require('stream');
var url      = require('url');
var qs       = require('querystring');
var parseURL = url.parse;

var METHODS      = 'get head post put del'.split(' ');
var HTTP_METHODS = 'GET HEAD POST PUT DELETE'.split(' ');

var Request = function(options) {
	this.writable = true;
	this.readable = true;
	this.method = options.method || 'GET';
	this.headers = options.headers || {};
	this.path = options.path;
	this.agent = options.agent;
	this.maxRedirects = 20;

	this._options = options;
	this._paused = false;
	this._writing = false;
	this._piping = false;
	this._encoding = null;
	
	this.request = null;
	this.response = null;

	var self = this;

	this.once('pipe', function(from) {
		self._piping = true;
		Object.keys(from.headers || {}).forEach(function(name) {
			self.headers[name] = self.headers[name] || from.headers[name];
		});
		if (typeof from.length === 'number') {
			self.headers['content-length'] = self.headers['content-length'] || from.length;
		}
	});
	process.nextTick(function() {
		if (self._piping || self._writing || !self.writable) return;
		self.headers['content-length'] = 0;
		self.end();
	});
};

Request.prototype.__proto__ = process.EventEmitter.prototype;

Request.prototype.setEncoding = function(encoding) {
	if (this.response) {
		this.response.setEncoding(encoding);
	} else {
		this._encoding = encoding;	
	}
	return this;
};
Request.prototype.setHeaders = function(map) {
	var self = this;

	Object.keys(map).forEach(function(name) {
		self.setHeader(name, map[name]);
	});
	return this;
};
Request.prototype.setHeader = function(name, val) {
	this.headers[name.toLowerCase()] = val;
	this._request().setHeader(name, val);
	return this;
};
Request.prototype.pipe = function(dest) {
	var self = this;

	if (dest.setHeader) {
		Object.keys(self.headers).forEach(function(name) {
			dest.setHeader(name, self.headers[name]);
		});
	}
	return Stream.prototype.pipe.apply(this, arguments);
};
Request.prototype.write = function(a,b) {
	if (!this._writing) {
		this._writing = true;
		this.emit('start');
	}
	return this._request().write(a,b);
};
Request.prototype.end = function(a,b) {
	if (!this._writing) {
		this.writable = false;
		this.emit('start');
	}
	return this._request().end(a,b);
};
Request.prototype.destroy = function() {
	this._request().abort();
	this.finish('close');
};
Request.prototype.pause = function() {
	if (this.response) return this.response.pause();
	this._paused = true;
};
Request.prototype.resume = function() {
	if (this.response) return this.response.resume();
	this._paused = false;
};
Request.prototype.finish = function(name, val) {
	if (!this.readable) return;
	this.readable = this.writable = false;
	this.emit(name, val);
};
Request.prototype._send = function() {
	this._options.agent = this.agent;
	this._options.headers = this.headers;

	var self = this;
	var lib = this._options.protocol === 'http:' ? require('http') : require('https');
	var request = this.request = lib.request(this._options);

	request.on('response', function(res) {
		if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
			if (!self.maxRedirects--) return self.finish('close', new Error('too many redirects'));
			self._options = parseURL(res.headers.location);
			self._send().end();
			return;
		}

		self.response = res;
		self.emit('response', res);

		if (self._paused) {
			res.pause();
		}
		if (self._encoding) {
			res.setEncoding(self._encoding);
		}

		res.on('data', function(data) {
			if (!self.readable) return;
			self.emit('data', data);
		});
		res.on('end', function() {
			self.finish('end');
		});
		res.on('close', function() {
			self.finish('close');
		});
	});
	request.on('close', function() {
		if (request !== self.request) return;
		self.finish('close');
	});
	request.on('error', function(err) {
		if (request !== self.request) return;
		self.finish('close', err);
	});
	request.on('drain', function() {
		if (request !== self.request) return;
		self.emit('drain');
	});

	this.emit('request', request);
	return request;
};
Request.prototype._request = function() {
	return this.request || this._send();
};

var send = function(options, onrequest) {
	options.method = options.method || 'GET';
	options.url = options.url.indexOf('://') === -1 ? 'http://'+options.url : options.url;
	options.query = options.query || options.qs;

	if (options.query) {
		options.url += (options.url.indexOf('?') === -1 ? '?' : '&') + qs.stringify(options.query);
	}

	var parsed = parseURL(options.url);

	parsed.headers = options.headers || {};
	parsed.agent = options.agent;

	var request = new Request(parsed);
	var body = options.body;

	request.once('start', function() {
		if (!onrequest || onrequest === send) return;
		onrequest(request);
	});

	if (options.pool || options.pool === false) {
		parsed.agent = options.pool;
	}
	if (options.form) {
		parsed.headers['content-type'] = 'application/x-www-form-urlencoded; charset=utf-8';
		body = qs.stringify(options.form);
	}
	if (options.json) {
		if (options.method !== 'GET' && options.method !== 'HEAD') {
			parsed.headers['content-type'] = 'application/json; charset=utf-8';
			body = JSON.stringify(typeof options.json !== 'boolean' ? options.json : body);
		}
		parsed.headers.accept = 'application/json';
	}
	if (body) {
		parsed.headers['content-length'] = Buffer.isBuffer(body) ? body.length : Buffer.byteLength(body);
		parsed.write(body);
		parsed.end();
	}
	if (!options.callback) return request;

	var buffer = '';

	request.setEncoding('utf-8');
	request.on('data', function(data) {
		buffer += data;
	});
	request.once('end', function() {
		request.response.body = buffer;
		if (!options.json) return options.callback(null, request.response, buffer);
		try {
			request.response.body = buffer = JSON.parse(buffer);
		} catch (err) {
			return options.callback(err);
		}
		options.callback(null, request.response, buffer);
	});
	request.once('close', function(err) {
		options.callback(err || new Error('premature close'));
	});

	return request;
};
var transform = function(url, options, callback) {
	if (url && typeof url === 'object') return transform(url.url, url, options);
	if (typeof options === 'function') return transform(url, {}, options);

	options = options || {};
	options.callback = options.callback || callback;
	options.url = url;
	return options;
};
var use = function(fn) {
	var curly = function(url, options, callback) {
		return fn(transform(url, options, callback), send);
	};

	curly.use = use;
	METHODS.forEach(function(method, i) {
		var verb = HTTP_METHODS[i];

		curly[method] = function(url, options, callback) {
			options = transform(url, options, callback);
			options.method = verb;
			return fn(options, send);
		};
	});
	return curly;
};

// TODO: add whitelist of allowed headers!
module.exports = use(send);