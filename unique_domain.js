

var 	_ = require('underscore'),
	fs = require('fs'),
	utils = require('./src/utils.js');



var uniqStream = fs.createWriteStream('./uniq-domains.txt', {flags: 'a', encoding: 'utf8'});

var txt = fs.readFileSync('wp-domain.txt', 'utf-8');
var unique_domain = fs.readFileSync('wp-domain.txt', 'utf-8');
var domains = txt.split("\n");

var uniq = {};

for(var i in domains){
	var url= domains[i].trim();
	if(url == ''){
		continue;
	}
	
	var short_url = url.replace('http://www.').replace('http://');
	if(uniq[short_url] !== 1){
		uniq[short_url] = 1;
		uniqStream.write(url + '\n')
	}

}
