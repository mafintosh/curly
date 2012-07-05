(function() {
	var XHR = window.XMLHttpRequest || function() {
		try {
			return new ActiveXObject('Msxml2.XMLHTTP.6.0');
		} catch (e) {}
		try {
			return new ActiveXObject('Msxml2.XMLHTTP.3.0');
		} catch (e) {}
		try {
			return new ActiveXObject('Microsoft.XMLHTTP');
		} catch (e) {}
	};

	var gensym = 0;
	var pending = {};
	var noop = function() {};
	var transform = function(url, options, callback) {
		if (typeof url === 'object') return transform(url.url || url.uri || '/', url, callback);
		if (typeof options === 'function') return transform(url, {}, options);

		options = options || {};
		options.url = url;
		options.callback = options.callback || callback || noop;

		return options;
	};
	var forEach = function(arr, fn) {
		for (var i = 0; i < arr.length; i++) {
			fn(arr[i], i);
		}
	};
	var querify = function(query, url) {
		var str = '';

		for (var key in query) {
			str += (str && '&')+key+'='+encodeURIComponent(query[key]);
		}
		return url ? (str && (url.indexOf('?') === -1 ? '?' : '&') + str) : str;
	};
	var send = function(options) {
		var xhr = new (options.XHR || XHR)();
		var method = options.method || 'GET';
		var url = options.url || options.uri;
		var body = options.body;
		var headers = options.headers || {};
		var query = options.query || options.qs || {};
		var bust = options.bust === undefined ? true : options.bust;
		var timeout = options.timeout || 3*60*1000;
		var ended = false;
		var id = gensym++;

		pending[id] = xhr;

		var timer = setTimeout(function() {
			callback(new Error('timeout'));
			xhr.abort();
		}, timeout);

		var callback = function(err) {
			if (ended) return;
			ended = true;

			clearTimeout(timer);
			xhr.onreadystatechange = xhr.onabort = noop;
			delete pending[id];

			if (err) return options.callback(err);
			if (xhr.status === 0) return options.callback(new Error('network error'));

			xhr.statusCode = xhr.status;
			xhr.body = xhr.responseText;

			if (options.json) {
				try {
					xhr.body = JSON.parse(xhr.body);
				} catch (err) {
					return options.callback(err);
				}
			}
			options.callback(null, xhr, xhr.body);
		};

		if (bust) {
			query.t = (new Date()).getTime();
		}
		if (options.form) {
			headers['content-type'] = 'application/x-www-form-urlencoded; charset=utf-8';
			body = querify(options.form);
		}
		if (options.json) {
			if (method !== 'GET' && method !== 'HEAD') {
				headers['content-type'] = 'application/json; charset=utf-8';
				body = JSON.stringify(typeof options.json !== 'boolean' ? options.json : body);
			}
			headers.accept = 'application/json';
		}

		try {
			xhr.open(method, url+querify(query, url));
			for (var header in headers) {
				xhr.setRequestHeader(header, headers[header]);
			}
			xhr.destroy = xhr.abort; // for consistency
			xhr.onabort = function() {
				callback(new Error('aborted'));
			};
			xhr.onreadystatechange = function() {
				if (xhr.readyState !== 4) return;
				setTimeout(callback, 0);
			};
			xhr.send(body || null);	
		} catch (err) {
			callback(err);
		}
		return xhr;
	};
	var use = function(fn) {
		var curly = function(url, options, callback) {
			return fn(transform(url,options,callback));
		};

		curly.use = use;
		forEach(['get','post','del','put','head'], function(method) {
			curly[method] = function(url, options, callback) {
				options = transform(url, options, callback);
				options.method = method.replace('del', 'delete').toUpperCase();
				return fn(options);
			};
		});
		return curly;
	};

	window.onunload = function() {
		for (var i in pending) {
			pending[i].abort();
		}
	};

	window.curly = use(send);
	if (typeof module === 'undefined') return;
	module.exports = window.curly;
}());