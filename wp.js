/**
 tessssssss
 * Created by Administrator on 14-1-8.
 */
var config = require('./config').jin,
	redis = require('redis'),
//	req = require('./src/Req'),
	req = require('./src/netReq'),
	_ = require('underscore'),
	events = require('events'),
	iconvLite = require('iconv-lite'),
	cheerio = require('cheerio'),
	fs = require('fs'),
	urlParser = require('url'),
	utils = require('./src/utils.js'),
	RedisBagpipe = require('./src/observer-redis-bagpipe');


var eventEmitter = new events.EventEmitter();

var errorHandler = function (message, obj) {
	//
	if(message.indexOf('getHostByName ETIMEOUT') >= 0 || (obj && obj.err && obj.err.syscall == 'getHostByName')){
		dnsErrorDmStream.write( obj.url + '\n');
	}	
	if(obj && obj.err == 'NetReq Timeout Emitted' ){
		networkTimeoutDmStream.write( obj.url + '\n');
	}
	console.log(message);
}

var wpDomainStream = fs.createWriteStream('./wp-domain.txt', {flags: 'a', encoding: 'utf8'});
var dnsErrorDmStream = fs.createWriteStream('./dns-error1.txt', {flags: 'a', encoding: 'utf8'});
var networkTimeoutDmStream = fs.createWriteStream('./net-timeout-dm.txt', {flags: 'a', encoding: 'utf8'});


var write2File = function (domain) {
	//console.log(domain);
	wpDomainStream.write(domain + '\n');
}

var redisClient = redis.createClient(config.redis.port, config.redis.host);


eventEmitter.on('event-error', errorHandler);
eventEmitter.addListener('event-new-domain', write2File);


var number = 0;

var crawler = {};
var R = new req.Req();
var RETRY_TIMES = 2;
crawler.oneurl = function (task, cb,task_idx) {

	//console.log(task.timeout);

	task.timeout = 60000
	R.get(task.url, {timeout: task.timeout}, function (err, response, body) {

		console.log("end get number:" + number++ );
		console.log('end get:' + task.url);
		cb(task_idx);//网络请求结束，调用下一个task

		if (err) {
			eventEmitter.emit('event-error', 'error get ' + task.url + ' ' + err,{ url:task.url, err : err});
			return;
		}
		if (response.statusCode === 200) {
			//统一按utf-8解码
			//todo:根据response header的 " Content-Type:text/html;charset=utf-8"
			//todo: 以及<meta http-equiv="content-type" content="text/html;charset=utf-8">解码


			body = iconvLite.decode(body, 'utf8');
			if(/["'][^"']*\/wp-content\/[^"']*["']/.test(body)){
			//if(false){
				eventEmitter.emit('event-new-domain', task.url);
				return;
			}else{
				R.get( task.url + "/xmlrpc.php" , {timeout: task.timeout} , function(err, response, body){
					if (err) {
						eventEmitter.emit('event-error', 'error get '  + task.url + "/xmlrpc.php" + ' ' + err,{ url:task.url, err : err});
						return;
					}
					if(response.statusCode === 200){
						body = iconvLite.decode(body, 'utf8');
						if(/XML-RPC server accepts POST requests only/.test(body)){
						//if(false){
							eventEmitter.emit('event-new-domain', task.url);
							return;
						}else{
							R.get( task.url + "/wp-login.php" , {timeout: task.timeout} , function(err, response, body){
								if (err) {
									eventEmitter.emit('event-error', 'error get ' + task.url + "/wp-login.php" + ' ' + err,{ url:task.url, err : err});
									return;
								}
								if(response.statusCode === 200){
									body = iconvLite.decode(body, 'utf8');
									if(/WordPress/.test(body)){
										eventEmitter.emit('event-new-domain', task.url);
										return;
									}
								}

							});
						}
					}

				});
			}


		}
	});

}


crawler.start = function () {
	bagpipe.getLen();

//	_.each(START_TASK, function (task) {
//		bagpipe.push(task);
//	});
	bagpipe.observer();
}

var bagpipe = new RedisBagpipe('redis',redisClient, 'cms_scan_queue_key',
	crawler.oneurl, function () {
	}, 50);


bagpipe.on('full', function (length) {

	console.log('xxxxxxxxxxxxx，目前长度为' + length);
	process.exit();

});

//http://www.rainweb.cn/article/355.html

process.on('uncaughtException', function(err){
	console.log('Caught exception:' + err);

});

process.on('restart', function(err){
	process.exit();

});

setTimeout(crawler.start, 3000);




