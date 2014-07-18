/**
 tessssssss
 * Created by Administrator on 14-1-8.
 */
var config = require('./config').vbox,
	redis = require('redis'),
	req = require('./src/Req'),
	_ = require('underscore'),
	fs = require('fs'),
	utils = require('./src/utils.js'),
	RedisBagpipe = require('./src/observer-redis-bagpipe');


var redisClient = redis.createClient(config.redis.port, config.redis.host);


var bagpipe = new RedisBagpipe(redisClient, 'cms_scan_queue_key',
	function(){}, function () {
	}, 50);
bagpipe.getLen();


bagpipe.on('full', function (length) {

	console.log('xxxxxxxxxxxxx，目前长度为' + length);
	process.exit();

});

var addTask = function (){
	var txt = fs.readFileSync('domains_block.txtaf', 'utf-8');
	var domains = txt.split("\n");
	for(var i in domains){
		domain = domains[i].trim();
		if(domain == ''){
			continue;
		}
		bagpipe.push({url: domain, retry: 1, timeout: 15000})
	}
}

setTimeout(addTask, 1000);
