/**
 * Created by Administrator on 14-1-8.
 */

var log4js = require('log4js');

log4js.configure({
  appenders: [
    { type : 'console'},
    { type: 'file', filename: 'logs/cheese.log', category: 'cheese' }
  ]
});


exports.logger = log4js.getLogger('cheese');

