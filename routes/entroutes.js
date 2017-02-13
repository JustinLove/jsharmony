/*
Copyright 2017 apHarmony

This file is part of jsHarmony.

jsHarmony is free software: you can redistribute it and/or modify
it under the terms of the GNU Lesser General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

jsHarmony is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public License
along with this package.  If not, see <http://www.gnu.org/licenses/>.
*/

var express = require('express');
var querystring = require('querystring');
var _ = require('lodash');
var path = require('path');
var fs = require('fs');

var jsHarmony = require('../index.js');
var ejsext = require('../lib/ejsext.js');
var Helper = require('../lib/Helper.js');
var HelperFS = require('../lib/HelperFS.js');
var async = require('async');
var url = require('url');

module.exports = function (jsh, jshconfig) {
  if(!jshconfig) jshconfig = {};
  jsh.Init.ValidateSystemConfig(jshconfig);
  var router = express.Router();
  router.jsh = jsh;
  router.jshconfig = jshconfig;
  if (jshconfig.onLoad) jshconfig.onLoad(jsh);
  
  /* GET home page. */
  router.all('*', function (req, res, next) {
    req.baseurl = jshconfig.baseurl;
    req.jshconfig = jshconfig;
    req.forcequery = {};
    req.getBaseJS = function () { return jsh.getBaseJS(req, jsh); }
    if (global.debug_params.web_detailed_errors) req._web_detailed_errors = 1;
    setNoCache(req,res);
    res.setHeader('X-UA-Compatible','IE=edge');
    return next();
  });
  router.route('/login').all(function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    (jshconfig.auth.onRenderLogin || jsh.RenderLogin).call(jsh, req, res, function (rslt) {
      if (rslt != false) res.render(HelperFS.getView(jshconfig.basetemplate), { title: 'Login', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password').all(function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    (jshconfig.auth.onRenderLoginForgotPassword || jsh.RenderLoginForgotPassword).call(jsh, req, res, function (rslt) {
      if (rslt != false) res.render(HelperFS.getView(jshconfig.basetemplate), { title: 'Forgot Password', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.route('/login/forgot_password_reset').all(function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    (jshconfig.auth.onRenderLoginForgotPasswordReset || jsh.RenderLoginForgotPasswordReset).call(jsh, req, res, function (rslt) {
      if (rslt != false) res.render(HelperFS.getView(jshconfig.basetemplate), { title: 'Reset Password', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  for (var i = 0; i < global.public_apps.length; i++) {
    var app = global.public_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  for (var i = 0; i < jshconfig.public_apps.length; i++) {
    var app = jshconfig.public_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  router.get('/system.css', function (req, res) {
    //Concatenate jsh css with system css
	var f = function(){ HelperFS.outputContent(req, res, jsh.Cache['jsHarmony.css'] + '\r\n' + jsh.Cache['system.css'],'text/css'); };
	if(jsh.Cache['jsHarmony.css']) f();
	else{
		var jshDir = path.dirname(module.filename);
		fs.readFile(jshDir + '/../jsHarmony.css','utf8',function(err,data){
			if(err) console.log(err);
			else{
				jsh.Cache['jsHarmony.css'] = data;
				f();
			}
		});
	}
  });
  router.all('*', function (req, res, next) {
    if(!jshconfig.auth){ return jsh.Auth.NoAuth(req, res, next); }
    //Handle Authentication
    (jshconfig.auth.onAuth || jsh.Auth).call(jsh, req, res, next, function (errno, msg) {
      if ((req.url.indexOf('/_d/') == 0) || (req.url.indexOf('/_ul/') == 0)) {
        //For AppSrv, return error message
        if (typeof errno == 'undefined') return Helper.GenError(req, res, -10, "User not authenticated, please log in");
        return Helper.GenError(req, res, errno, msg);
      }
      else {
        var loginurl = req.baseurl + 'login?' + querystring.stringify({ 'source': req.originalUrl });
        jsh.Redirect302(res, loginurl);
      }
    });
  });
  router.get('/logout', function (req, res, next) {
    if(!jshconfig.auth){ console.log('Auth not configured in config'); return next(); }
    jsh.RenderLogout(req, res, function (rslt) {
      if (rslt != false) res.render(HelperFS.getView(jshconfig.basetemplate), { title: 'Logout', body: rslt, XMenu: {}, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
    });
  });
  router.get('/system.js', function (req, res) {
    HelperFS.outputContent(req, res, jsh.Cache['system.js'],'text/javascript');
  });
  for (var i = 0; i < global.private_apps.length; i++) {
    var app = global.private_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  for (var i = 0; i < jshconfig.private_apps.length; i++) {
    var app = jshconfig.private_apps[i];
    for (var j in app) router.all(j, app[j].bind(jsh.AppSrv));
  }
  router.post('/_ul/clear', function (req, res) {
    jsh.AppSrv.ClearUpload(req, res);
  });
  router.post('/_ul/ckeditor', function (req, res) {
    jsh.AppSrv.UploadCKEditor(req, res);
  });
  router.post('/_ul/', function (req, res) {
    req.jsproxyid = 'xfileuploader';
    jsh.AppSrv.Upload(req, res);
  });
  router.post('/_ul/json', function (req, res) {
    jsh.AppSrv.Upload(req, res);
  });
  router.get('/_dl/_temp/:keyid', function (req, res) {
    var keyid = req.params.keyid;
    if (typeof keyid === 'undefined') { next(); return; }
    var params = {};
    if (req.query && req.query.view) params.view = true;
    jsh.AppSrv.Download(req, res, '_temp', keyid, undefined, params);
  });
  router.get('/_dl/:modelid/:keyid/:fieldid', function (req, res) {
    var modelid = req.params.modelid;
    if (typeof modelid === 'undefined') { next(); return; }
    var keyid = req.params.keyid;
    if (typeof keyid === 'undefined') { next(); return; }
    var fieldid = req.params.fieldid;
    if (typeof fieldid === 'undefined') { next(); return; }
    var params = {};
    if (req.query && req.query.view) params.view = true;
    if (req.query && req.query.thumb) params.thumb = true;
    jsh.AppSrv.Download(req, res, modelid, keyid, fieldid, params);
  });
  router.get('/_token', function (req, res) { 
    jsh.AppSrv.GetToken(req, res);
  });
  router.post('/_d/_transaction', function (req, res) {
    if (!('data' in req.body)) { next(); return; }
    var data = JSON.parse(req.body.data);
    if (!(data instanceof Array)) { next(); return; }
    
    var dbtasks = {};
    if (global.debug_params.appsrv_requests) global.log(data);
    var i = 0;
    async.eachSeries(data, function (action, callback) {
      i += 1;
      var query = {};
      var post = {};
      if (!('method' in action)) throw new Error('Action missing method');
      if (!('model' in action)) throw new Error('Action missing model');
      var method = action.method;
      var modelid = action.model
      //Parse query, post
      if ('query' in action) query = querystring.parse(action.query);
      if ('post' in action) post = querystring.parse(action.post);
      //Queue up dbtasks
      var actionprocessed = function (err, curdbtasks) {
        if (typeof curdbtasks == 'undefined') { callback(new Error('Error occurred while processing DB action')); /*Error has occurred*/ }
        if (_.isEmpty(curdbtasks)) { callback(null); /*Nothing to execute*/ }
        
        for (var model in curdbtasks) {
          dbtasks[i + '_' + model] = curdbtasks[model];
        }
        callback(null);
      };
      if (method == 'get') actionprocessed(null, jsh.AppSrv.getModel(req, res, modelid, true, query, post));
      else if (method == 'put') jsh.AppSrv.putModel(req, res, modelid, true, query, post, actionprocessed);
      else if (method == 'post') jsh.AppSrv.postModel(req, res, modelid, true, query, post, actionprocessed);
      else if (method == 'delete') jsh.AppSrv.deleteModel(req, res, modelid, true, query, post, actionprocessed);
    }, function (err) {
      if (err == null) {
        //Execute them all
        jsh.AppSrv.ExecTasks(req, res, dbtasks, true);
      }
    });
  });
  router.get('/_d/_report/:reportid/', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (typeof modelid === 'undefined') { next(); return; }
    jsh.AppSrv.getReport(req, res, modelid);
  });
  router.get('/_d/_reportjob/:reportid/', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (typeof modelid === 'undefined') { next(); return; }
    jsh.AppSrv.getReportJob(req, res, modelid);
  });
  router.get('/_csv/:modelid/', function (req, res, next) {
    var modelid = req.params.modelid;
    if (typeof modelid === 'undefined') { next(); return; }
    if (!(modelid in jsh.Models)) { next(); return; }
    var model = jsh.Models[modelid];
    if (model.layout != 'grid') throw new Error('CSV Export only supported on Grid');
    var dbtask = jsh.AppSrv.getModelRecordset(req, res, modelid, req.query, req.body, global.export_rowlimit, { 'export': false });
    jsh.AppSrv.exportCSV(req, res, dbtask, modelid);
  });
  router.get('/_queue/:queueid', function (req, res, next) {
    var queueid = req.params.queueid;
    if (typeof queueid === 'undefined') { next(); return; }
    jsh.AppSrv.SubscribeToQueue(req, res, next, queueid);
  });
  router.delete('/_queue/:queueid', function (req, res, next) {
    var queueid = req.params.queueid;
    if (typeof queueid === 'undefined') { next(); return; }
    jsh.AppSrv.PopQueue(req, res, queueid);
  });
  router.route('/_d/:modelid/')
		.all(function (req, res, next) {
    var modelid = req.params.modelid;
    if (typeof modelid === 'undefined') { next(); return; }
    var verb = req.method.toLowerCase();
    if (verb == 'get') jsh.AppSrv.getModel(req, res, modelid);
    else if (verb == 'put') jsh.AppSrv.putModel(req, res, modelid);
    else if (verb == 'post') jsh.AppSrv.postModel(req, res, modelid);
    else if (verb == 'delete') jsh.AppSrv.deleteModel(req, res, modelid);
  });
  router.get('/', function (req, res) {
    var modelid = jsh.getModelID(req);
    if (modelid != '') {
      return Helper.Redirect302(res,'/'+modelid);
    }
    else {
      //Get root menu and render
      var params = {};
      req.jshconfig.menu(req, res, jsh, params, function () {
        if (params.XMenu && params.XMenu.MainMenu) {
          for (var i = 0; i < params.XMenu.MainMenu.length; i++) {
            var link = params.XMenu.MainMenu[i].Link;
            if(link && (link != url.parse(req.originalUrl).pathname)) return Helper.Redirect302(res, link);
          }
        }
        //Show model listing, if applicable
        if(params.ShowListing){
          _.extend(params, { title: 'Models', body: jsh.RenderListing(), TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh });
          return res.render(HelperFS.getView(jshconfig.basetemplate), params);
        }
        //Otherwise, show error
        res.end('No forms available');
      });
    }
  });
  router.get('/_report/:reportid/:reportkey?', function (req, res, next) {
    var modelid = '_report_' + req.params.reportid;
    if (!(modelid in jsh.Models)) return next();
    genOnePage(jsh, req, res, modelid);
  });
  router.get('/_model/:modelid', function (req, res, next) {
    //Return model meta-data for OnePage rendering
    var modelid = req.params.modelid;
    if (!(modelid in jsh.Models)) return next();
    processModelQuerystring(jsh, req, modelid);

    var f = function () { jsh.AppSrv.modelsrv.GetModel(req, res, modelid); };
    if (jsh.Models[modelid].onroute) {
      return jsh.Models[modelid].onroute('jsh', req, res, f, require, jsh, modelid);
    }
    else return f();
  });
  router.get('/_restart', function (req, res, next) {
    if(!('SYSADMIN' in req._roles)) return next();
    res.end('<html><body>Server will restart in 1 sec...<script type="text/javascript">window.setTimeout(function(){document.write(\'Restart initiated\');},1000);</script></body></html>');
    setTimeout(function(){ process.exit(); },1000);
  });
  router.get('/:modelid/:modelkey?', function (req, res, next) {
    //Verify model exists
    var modelid = req.params.modelid;
    if (modelid in jsh.Models) {
      var f = function () { genOnePage(jsh, req, res, modelid); };
      if (jsh.Models[modelid].onroute) {
        return jsh.Models[modelid].onroute('base', req, res, f, require, jsh, modelid);
      }
      else return f();
    }
    else {
      HelperFS.gen404(res);
      return;
      //return next();
    }
  });
  
  return router;
};

function genOnePage(jsh, req, res, modelid){
  //Render OnePage body content
  var ejsbody = require('ejs').render(jsh.getEJS('jsh_onepage'), {
    req: req, _: _, ejsext: ejsext,
    srcfiles: jsh.AppSrv.modelsrv.srcfiles,
    popups: jsh.Popups
  });
  //Set template (popup vs full)
  var tmpl_name = req.jshconfig.basetemplate;
  if ('popup' in jsh.Models[modelid]){
    if('popup' in global.views) tmpl_name = 'popup';
  }
  //Render page
  jsh.RenderTemplate(req, res, tmpl_name, {
    title: '', body: ejsbody, TopMenu: '', ejsext: ejsext, modelid: '', req: req, jsh: jsh
  });
}

function processModelQuerystring(jsh, req, modelid) {
  if (!(modelid in jsh.Models)) return;
  req.forcequery = {};
  var model = jsh.Models[modelid];
  if (!('querystring' in model)) return;
  var qs = model.querystring;
  for (qkey in model.querystring) {
    if (qkey.length < 2) continue;
    var qtype = qkey[0];
    var qkeyname = qkey.substr(1);
    if ((qtype == '&') || ((qtype == '|') && !(qkeyname in req.query))) {
      var qval = model.querystring[qkey];
      qval = Helper.ResolveParams(req, qval);
      //Resolve qval
      req.query[qkeyname] = qval;
      req.forcequery[qkeyname] = qval;
    }
  }
}

function setNoCache(req, res){
  if (req.headers['user-agent'] && req.headers['user-agent'].match(/Trident\//)) {
    //Add Cache header for IE
    res.header('Cache-Control', 'no-cache, private, no-store, must-revalidate, max-stale=0, post-check=0, pre-check=0');
  }
}