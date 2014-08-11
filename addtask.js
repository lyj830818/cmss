/**
 tessssssss
 * Created by Administrator on 14-1-8.
 */
var config = require('./config').jin,
	redis = require('redis'),
	req = require('./src/Req'),
	_ = require('underscore'),
	fs = require('fs'),
	utils = require('./src/utils.js'),
	RedisBagpipe = require('./src/observer-redis-bagpipe');


var redisClient = redis.createClient(config.redis.port, config.redis.host);


var bagpipe = new RedisBagpipe('redis', redisClient, 'mailpoet_queue',
	function(){}, function () {
	}, 50);
bagpipe.getLen();


bagpipe.on('full', function (length) {

	console.log('xxxxxxxxxxxxx，目前长度为' + length);
	process.exit();

});

var addTask = function (){
	var txt = fs.readFileSync('uniq-domains.txt', 'utf-8');
	//var txt = fs.readFileSync('mailpoet-example.txt', 'utf-8');
	var domains = txt.split("\n");
	for(var i in domains){
		domain = domains[i].trim();
		if(domain == ''){
			continue;
		}
		//bagpipe.push({url: 'http://' +  domain, retry: 1, timeout: 30000})
		bagpipe.push({url:  domain, retry: 1, timeout: 30000})
	//	bagpipe.push({url: 'http://' + 'www.' + domain, retry: 1, timeout: 30000})
	}
}

setTimeout(addTask, 1000);
