/**
 tessssssss
 * Created by Administrator on 14-1-8.
 */
var config = require('./config').vbox,
	redis = require('redis'),
	req = require('./src/Req'),
	_ = require('underscore'),
	events = require('events'),
	iconvLite = require('iconv-lite'),
	cheerio = require('cheerio'),
	fs = require('fs'),
	urlParser = require('url'),
	utils = require('./src/utils.js'),
	RedisBagpipe = require('./src/observer-redis-bagpipe');


var eventEmitter = new events.EventEmitter();

var errorHandler = function (message) {
	console.log(message);
}

var wpDomainStream = fs.createWriteStream('./mailpoet.txt', {flags: 'a', encoding: 'utf8'});


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
crawler.oneurl = function (task, cb) {

	//console.log(task.timeout);

	task.timeout = 60000;
  var domain = task.url;
	task.url = domain + '/wp-content/plugins/wysija-newsletters/css/admin.css';
	R.get(task.url, {timeout: task.timeout}, function (err, response, body) {

		console.log("end get number:" + number++ );
		console.log('end get:' + task.url);
		cb();//网络请求结束，调用下一个task

		if (err) {
			eventEmitter.emit('event-error', 'error get ' + task.url + ' ' + err);
			return;
		}
		if (response.statusCode === 200) {
      body = iconvLite.decode(body, 'utf8');

      console.log("body length:" + body.length);
			if(/wysija/.test(body) && body.length < 10000){
        task.url = domain + '/wp-content/plugins/wysija-newsletters/readme.txt';
        R.get(task.url , {timeout: task.timeout}, function(err , response , body){
          if(err){
            eventEmitter.emit('event-new-domain', domain);
            return;
          }

          body = iconvLite.decode(body, 'utf8');
          if(/2\.6\.8/.test(body) || /2\.6\.9/.test(body)){
            return;
          }else{
            eventEmitter.emit('event-new-domain', domain);

          }


        });

				return;
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

var bagpipe = new RedisBagpipe(redisClient, 'cms_scan_queue_key',
	crawler.oneurl, function () {
	}, 30);


bagpipe.on('full', function (length) {

	console.log('xxxxxxxxxxxxx，目前长度为' + length);
	process.exit();

});

//http://www.rainweb.cn/article/355.html
process.on('uncaughtException', function(err){
	console.log('Caught exception:' + err);

});

setTimeout(crawler.start, 3000);




