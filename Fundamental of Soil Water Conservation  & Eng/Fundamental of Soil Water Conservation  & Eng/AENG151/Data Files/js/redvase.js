/*
RedVase, version 1.6
(c) Copyright 2007 Bravenet Media Network. All Rights Reserved.
*/

if (!Array.prototype.push) {
  // implements Array.push since this may not be available
  Array.prototype.push = function() {
    var al = arguments.length; var l = this.length;
    for ( var i = 0; i < al; ++i ) {
      this[l+i] = arguments[i];
    }
    return this.length;
  };
}

if ( typeof(RedVase) == 'undefined' ) {
  var RedVase = (function() {
    var _url_base = 'http://redvase.bravenet.com',
    _page_ads = [],
    _head = document.getElementsByTagName('HEAD')[0],
    _macro_matcher = /{{\s*(\w*)\s*}}/m;

    // converts ad hash into url
    function _to_url(ad) {
      var url = [ _url_base ];
      var query_string = [ ];

      // construct base url
      url.push((ad.content == 'html' || ad.content == 'iframe' ? 'creative' : ad.content)); delete ad.content;
      url.push(ad.publisher); delete ad.publisher;
      url.push(ad.kind); delete ad.kind;
      if (ad.alternate) { url.push(ad.alternate); delete ad.alternate; }

      // append the iframe formats if needed
      if (ad.format) { 
        var matches = ad.format.match(RedVase.FORMAT_REGEX)
        query_string.push('ifh=' + matches[1]);
        query_string.push('ifw=' + matches[2]);
        delete ad.format; 
      }

      // append any censorship details
      if (ad.censor) {
        var i = 0, v = null;
        for (i; (v = ad.censor[i]); i++) {
          query_string.push('csr[]=' + v);
        }
        delete ad.censor;
      }

      // append randomizer
      query_string.push('r=' + (ad.random || new Date().getTime()))
      if (ad.random) { delete ad.random; }

      // unshift any other params so randomizer is last
      for (var key in ad) {
        if (typeof(ad[key]) == 'string') query_string.unshift([key] + '=' + ad[key]);
      }

      return url.join('/') + '?' + query_string.join('&');
    }

    // injects the ad onto the document
    function _show(ad) {
      document.writeln('<script src="' + _to_url(ad) + '" type="text/javascript" charset="utf-8"><\/script>');
    }

    // shortcut method
    function _record_and_show(ad) {
      _page_ads.push(ad);
      _show(ad);
    }

    // converts options hash to attribute string
    function _to_pop_options(hash) {
      if (typeof hash == 'string') return hash;
      var result = [];
      for (var key in hash) {
        result.push(key+'='+hash[key]);
      }
      return result.join(',');
    }

    // template processing generator function
    function _gen_template_processor(uid, cbt, template_or_fun, options) {
      var render = null, post = options.post || function(json) { return json; };

      if (typeof template_or_fun == 'function') {
        render = template_or_fun;
      } else if (typeof template_or_fun == 'string') {
        render = function(json) {
          return RedVase.Mustache.to_html(template_or_fun, json);
        }
      } else {
        throw "unsupported template_or_fun type, must be String or Function"
      }

      return function(json) { return render(post(json)); };
    }

    function _register_callback(uid, cbt, func, options) {
      var max_retries = options.max_retries || 3,
      retry_wait = options.retry_wait || 50;
      if (typeof RedVase.Callbacks == 'undefined') { RedVase.Callbacks = {}; }
      RedVase.Callbacks[uid] = function(json, attempts) {
        var results = { "results": json },
        clean = function() {
          delete RedVase.Callbacks[uid];
        };

        try {
          document.getElementById(cbt).innerHTML = func(results);
          clean();
        } catch (e) {
          attempts = attempts || 1;
          if (attempts > max_retries) {
            clean();
            throw e;
          } else {
            setTimeout(function() {
              RedVase.Callbacks[uid](json, attempts + 1);
            }, retry_wait);
          }
        }
      };
    }

    function _style_from_options(options) {
      var style = "";
      if (typeof options.style == 'string') { style = 'style="'+options.style+'"'; }
      else if (typeof options.style == 'object') {
        style = [' style="'];
        for (var s in options.style) {
          if (options.hasOwnProperty(s)) {
            style.push(s + ': ' + options.style[s]);
          }
        }
        style.push('"');
        style = style.join(';');
      }
      return style;
    }

    function _jsonp(url, wait) {
      setTimeout(function() {
        var script = document.createElement('script');
        script.setAttribute("src", url);
        script.setAttribute("type", "text/javascript");
        script.setAttribute("charset", "utf-8");
        _head.appendChild(script);
      }, wait || 1);
    }

    function _call_async(url, template_or_fun, options) {
      var uid = Math.floor(Math.random() * 11),
      style = _style_from_options(options),
      cbt = 'redvase_ad_' + uid,
      cbs = 'callback=RedVase.Callbacks['+uid+']',
      processor = _gen_template_processor(uid, cbt, template_or_fun, options);

      url += (url.indexOf('?') == -1 ? '?' : '&') + cbs;
      _register_callback(uid, cbt, processor, options);

      document.writeln('<div id="'+cbt+'"'+style+'></div>');
      document.writeln('<script type="text/javascript" charset="utf-8" src="'+_url_base+'/javascripts/mustache.js"><\/script>');
      _jsonp(url);
    }

    return {
      placement: function(block) {
        var ad = {};
        block(ad);
        if ((new RedVase.Sanitizer(ad)).check()) {
          _record_and_show(ad);
        }
      },
      show_popunder: function(url, name, options) {
        if (!url) throw "required url missing";
        name = name || '_blank';
        options = _to_pop_options(options || {});
        return window.open(url, name, options);
      },
      async_creative: function(url, template, options) {
        if (!url) { throw "required url missing"; }
        options = options || {}
        _call_async(url, template, options);
      },
      extend: function(dest, source) {
        for (var prop in source) { dest[prop] = source[prop]; }
        return dest;
      }
    };
  })();

  RedVase.FORMAT_REGEX = /(\d+)x(\d+)/;
  RedVase.Sanitizer = function(ad) {
    this.ad = ad;
    this.sane = true;
  };
  RedVase.Sanitizer.prototype  = {
    update: function(result) {
      if (this.sane && !result) {
        this.sane = false;
      }
      return result;
    },
    assert_array: Array.isArray || function(val) {
      return val && typeof(val) === 'object' &&
                    typeof(val.length) === 'number' &&
                    typeof(val.splice) === 'function' &&
                    !(val.propertyIsEnumerable('length'));
    },
    assert_exists: function(flag) {
      return this.update(flag);
    },
    assert_string: function(flag, allow_undefined) {
      if (typeof(allow_undefined) === 'undefined') allow_undefined = false;
      return (allow_undefined || this.update(this.assert_exists(flag)) && typeof(flag) == 'string');
    },
    assert_content: function(flag) {
      if (flag != 'html' && flag != 'pop' && flag != 'iframe') {
        flag = 'html';
      }
      return flag;
    },
    assert_format: function(flag, allow_undefined) {
      if (typeof(allow_undefined) === 'undefined') allow_undefined = false;
      if (typeof(flag) === 'undefined' && allow_undefined) return null;
      if ( this.update( this.assert_string(flag, true) && RedVase.FORMAT_REGEX.test(flag) ) ) {

        return flag.match(RedVase.FORMAT_REGEX)[0];
      }
      return null;
    },
    assert_censored: function(flag) {
      flag = typeof(flag) === 'undefined' ? [] : flag;
      if ( this.update( this.assert_array(flag) ) ) {
        var i = 0, cat = null, parsed = [];
        for (i; (cat = parseInt(flag[i], 10)); i++) {
          if (!isNaN(cat)) { parsed.push(cat); }
        }
        return parsed;
      }
      return flag;
    },
    check: function() {
      var ad = this.ad;
      // make sure ad.content is set
      ad.content = this.assert_content(ad.content);
      this.assert_string(ad.publisher);
      this.assert_string(ad.kind);
      this.assert_string(ad.alternate, true);
      ad.format = this.assert_format(ad.format, true);
      if (ad.format === null) delete ad.format;
      ad.censor = this.assert_censored(ad.censor);
      return this.sane;
    }
  };
}

if (typeof(redvase_ad) != 'undefined') {
  (function(redvase_ad_var) {
      RedVase.placement(function(ad) {
      for (var k in redvase_ad_var) {
        ad[k] = redvase_ad_var[k];
      }
    });
  })(redvase_ad);
  redvase_ad = null;
}
