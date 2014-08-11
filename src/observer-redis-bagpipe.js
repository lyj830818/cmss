/**
 * Created by Administrator on 14-1-13.
 */
var util = require("util");
var events = require("events");
var logger = require('./Logger').logger;

/**
 * 构造器，传入限流值，设置异步调用最大并发数
 * Examples:
 * ```
 * var bagpipe = new Bagpipe(100);
 * bagpipe.push(fs.readFile, 'path', 'utf-8', function (err, data) {
 * });
 * ```
 * Events:
 * - `full`, 当活动异步达到限制值时，后续异步调用将被暂存于队列中。当队列的长度大于限制值的2倍或100的时候时候，触发`full`事件。事件传递队列长度值。
 * - `outdated`, 超时后的异步调用异常返回。
 * Options:
 * - `disabled`, 禁用限流，测试时用
 * - `refuse`, 拒绝模式，排队超过限制值时，新来的调用将会得到`TooMuchAsyncCallError`异常
 * - `timeout`, 设置异步调用的时间上线，保证异步调用能够恒定的结束，不至于花费太长时间
 * @param {Number} limit 并发数限制值
 * @param {Object} options Options
 */
var Bagpipe = function (type, server, taskQueueKey, method, callback, limit, options) {
	events.EventEmitter.call(this);
	this.server = server;
  this.type = type;
	this.taskQueueKey = taskQueueKey;
	this.limit = limit;
	this.activeTask = {}; 
	this.method = method;
	this.callback = callback;
	this.activePrePop = 0;
	this.activePostPop = 0;
	this.queue = [];
  this.startTime = new Date();

	//队列最大长度，redis应该是无限的，为防止内存占用过大，设一个小点值
  this.maxLength = 20 * 1000 * 1000; // 10M * sizeof(item)
	//this.maxLength = 1 * 100;
  this.queueLength = 0;
	this.pop_id = 0;
	this.task_idx = 0;
};

util.inherits(Bagpipe, events.EventEmitter);


Bagpipe.prototype.getLen = function(){
	//队列长度
	var that = this;
  switch(that.type){
    case 'redis':
      this.server.llen(this.taskQueueKey, function(err , reply){
        that.queueLength = reply;
      });
      break;
    case 'ssdb':
      this.server.qsize(this.taskQueueKey, function(err , reply){
        that.queueLength = reply;
      });
      break;

    default:
  }

  logger.debug("get queueLength:%d" , that.queueLength);
  
	
}

Bagpipe.prototype.clear = function () {
	var that = this;
  switch(that.type){
    case 'redis':
      this.server.del(this.taskQueueKey, function (err,reply) {
      });
      break;
    case 'ssdb':
      this.server.qclear(this.taskQueueKey, function(err , reply){
      });
      break;

    default:

  }
	
}

/**
 * 推入方法，参数。最后一个参数为回调函数
 * @param {Function} method 异步方法
 * @param {Mix} args 参数列表，最后一个参数为回调函数。
 */
Bagpipe.prototype.push = function () {
	var that = this;

	// 队列长度也超过限制值时
	var args = [].slice.call(arguments, 0)
  if(that.queueLength > that.maxLength){
			that.emit('full', that.queueLength, args[0].url);
      return this;
  }


  switch(that.type){
    case 'redis':
      this.server.rpush(this.taskQueueKey, JSON.stringify(args), function (err, replies) {
        if (err) {
          logger.debug('rpush error' + args.toString() + err);
          return;
        }
      });
      break;

    case 'ssdb':
      this.server.qpush(this.taskQueueKey, JSON.stringify(args), function (err, replies) {
        if (err) {
          logger.debug('qpush error' + args.toString() + err);
          return;
        }
      });
      break;
    default:

  }

	return this;

};

/*!
 * 从队列中pop一个
 */
Bagpipe.prototype.next = function () {
	var that = this;

  switch(that.type){
    case 'redis':
	    that.pop_id++;
	    //logger.info("start lpop id:" + that.pop_id);
      that.server.lpop(that.taskQueueKey, function (err, replies) {
	     // logger.info("end lpop id:" + that.pop_id);
        //replies == null 时说明队列为空
        if (err || replies === null) {
          //对提前加上或减去的数值进行修正
          that.activePrePop--;
          logger.debug('lpop error ' + err);
          logger.debug('lpop replies ' + replies);
          return;
        }
        var args = JSON.parse(replies);
        that.activePostPop++;
        that.run(that.method, args);

      });
      break;

    case 'ssdb':
	    that.pop_id++;
	    logger.info("start qpop_front id:" + that.pop_id);
      that.server.qpop_front(that.taskQueueKey, function (err, replies) {
	      logger.info("end qpop_front id:" + that.pop_id);
        //replies == undefined 时说明队列为空
        if (err || replies === undefined) {
          //对提前加上或减去的数值进行修正
          that.activePrePop--;
          logger.debug('qpop_front error' + err);
          return;
        }
        var args = JSON.parse(replies);
        that.activePostPop++;
        that.run(that.method, args);

      });
      break;
    default:

  }




};

Bagpipe.prototype._finish = function (idx) {

  //logger.debug('active--');
  delete this.activeTask[idx];
	this.activePrePop--;
	this.activePostPop--;
};


Bagpipe.prototype.deleteTimeoutTask= function(){
  var that = this;
  var TASK_TIMEOUT = 250;
  var task;
  console.dir(that.activeTask);
  var len = 0;
  for(var key in that.activeTask){
    ++len;

    task = that.activeTask[key];
    var now = new Date();
    //console.log('time --');
    //console.log(now - task['start_time']);
    if(now - task['start_time'] > TASK_TIMEOUT * 1000 ){
      delete that.activeTask[task.idx];
      that.activePrePop--;
      that.activePostPop--;
      console.dir('delete task:');
      console.dir(task);
      console.log(now - task['start_time']);
    }
  }
  console.log('activeTask len:' + len);

}

Bagpipe.prototype.observer = function(){
	var that = this;
	setTimeout(function(){
    //restart every hour
    if(new Date() - that.startTime > 3600000){
      that.emit('restart');
      return;
    }

		logger.debug("-------------------------------------");
		logger.warn('pre pop active:' + that.activePrePop);
		logger.warn('post pop active:' + that.activePostPop);

    that.deleteTimeoutTask();
    
    /*
		if(that.activePrePop - that.activePostPop > 5){
			logger.debug("conncet exceptino ,let terminate the process");
			that.emit('ssdb-error');
//			that.activePrePop = 0;
//			that.activePostPop = 0;
		}
   */

		while(that.activePrePop < that.limit){
			that.activePrePop++;
			that.next();
		}


    //每秒钟pop一次，防止数据库过载
    /*
    if(that.activePrePop < that.limit){
			that.activePrePop++;
			that.next();
		}
   */

		that.observer();
	} , 10000);

}

Bagpipe.prototype.UpLenForever = function(){
	var that = this;
	setTimeout(function(){
    that.getLen();
		that.UpLenForever();
	} , 50000);

}

/*!
 * 执行队列中的方法
 * @param {Function} method : 要执行的方法(crawler.oneurl)
 * @param {Object} args : 执行参数(入队的task 对象)
 */
Bagpipe.prototype.run = function (method, args) {
	var that = this;

  this.task_idx++;

	//这是method方法中的异步调用完成后调用的方法，用来通知队列进行_finish()
	args.push(function (task_idx) {

		that.callback.apply(null, arguments);
		that._finish(task_idx);

	});
  args.push(this.task_idx);
  var task_info = {'idx': this.task_idx,'start_time' : new Date(),'url' : args[0].url};
  this.activeTask[this.task_idx] = task_info;

  logger.debug('args:')
  logger.debug(args);
	method.apply(null, args);
};

module.exports = Bagpipe;

