var Stream   = require('stream');
var url      = require('url');
var qs       = require('querystring');
var parseURL = url.parse;

var METHODS      = 'get head post put del'.split(' ');
var HTTP_METHODS = 'GET HEAD POST PUT DELETE'.split(' ');
var BLACKLIST    = {expect:1,host:1};

var Request = function(options) {
	this.writable = true;
	this.readable = true;
	this.method = options.method || 'GET';
	this.headers = options.headers || {};
	this.url = options.path; // we name it url as it's called url on http.ServerRequest
	this.agent = options.agent;

	this.bytesWritten = 0;
	this.maxRedirects = 20;
	this.retries = options.retries || 0;
	this.request = null;
	this.response = null;

	this._options = options;
	this._encoding = null;
	this._paused = false;
	this._open = false;
	this._piping = false;
	
	var self = this;

	this.once('pipe', function(from) {
		self._piping = true;
		if (from.headers) {
			Object.keys(from.headers).forEach(function(name) {
				if (!from.headers[name] || BLACKLIST[name]) return;
				self.headers[name] = self.headers[name] || from.headers[name];
			});			
		}
		if (typeof from.length === 'number') {
			self.headers['content-length'] = self.headers['content-length'] || from.length;
		}
	});
	process.nextTick(function() {
		if (self._piping || self.bytesWritten || !self.writable) return;
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
Request.prototype.setHeader = function(name, val) {
	this.headers[name.toLowerCase()] = val;
	return this;
};
Request.prototype.pipe = function(dest, opt) {
	this.once('response', function(res) {
		if (!dest.setHeader) return;
		Object.keys(res.headers).forEach(function(name) {
			if (dest.getHeader && dest.getHeader(name) || BLACKLIST[name]) return;
			dest.setHeader(name, res.headers[name]);
		});
		dest.statusCode = res.statusCode;
	});
	return Stream.prototype.pipe.apply(this, arguments);
};
Request.prototype.write = function(a,b) {
	this.bytesWritten += a.length;
	return this._request().write(a,b);
};
Request.prototype.end = function(a,b) {
	this.writable = false;
	return this._request().end(a,b);
};
Request.prototype.destroy = function() {
	this.retries = 0;
	if (this.request) {
		this.request.abort();
	}
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
Request.prototype.retry = function() {
	var self = this;

	if (!this.retries || this._open) return false;
	this.retries--;
	setTimeout(function() {
		if (!self.readable) return;
		self._send(true).end();
	}, 5000);
	return true;
};
Request.prototype._send = function(silent) {
	this._options.method = this.method;
	this._options.headers = this.headers;
	this._options.agent = this.agent;
	this._options.path = this.url;

	var self = this;
	var lib = this._options.protocol === 'http:' ? require('http') : require('https');
	var request = this.request = lib.request(this._options);

	request.on('response', function(res) {
		if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
			if (!self.maxRedirects--) return self.finish('close', new Error('too many redirects'));
			self._options = parseURL(res.headers.location);
			self._send(true).end();
			return;
		}

		self.retries = 0;
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
		if (!self.retry()) return self.finish('close', err);
		request = null;
	});
	request.on('drain', function() {
		if (request !== self.request) return;
		self.emit('drain');
	});
	if (silent) return request;
	this.emit('request', request);	
	return request;
};
Request.prototype._request = function() {
	if (!this._open) {
		this._open = true;
		this.emit('open');
	}
	return this.request || this._send();
};

var send = function(options) {
	options.method = options.method || 'GET';
	options.url = options.url.indexOf('://') === -1 ? 'http://'+options.url : options.url;
	options.query = options.query || options.qs;

	if (options.query) {
		options.url += (options.url.indexOf('?') === -1 ? '?' : '&') + qs.stringify(options.query);
	}

	var parsed = parseURL(options.url);
	var body = options.body;

	parsed.retries = options.retry === true ? 5 : options.retry;
	parsed.method = options.method;
	parsed.headers = options.headers || {};
	parsed.agent = options.agent;

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
	}

	var request = new Request(parsed);

	if (body) {
		request.write(body);
		request.end();
	}
	if (!options.callback || options.buffer === false) return request;

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
		return fn(transform(url, options, callback));
	};

	curly.use = use;
	METHODS.forEach(function(method, i) {
		var verb = HTTP_METHODS[i];

		curly[method] = curly[verb] = function(url, options, callback) {
			options = transform(url, options, callback);
			options.method = verb;
			return fn(options);
		};
	});
	return curly;
};

module.exports = use(send);