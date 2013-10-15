var events = require('events');
var util = require('util');

// Mock http.createServer
var httpServer = function(){
    events.EventEmitter.apply(this, arguments);
};
util.inherits(httpServer, events.EventEmitter);
httpServer.prototype.listen = function(port, hostname, callback){
    process.nextTick(callback);
};

// Mock incoming data
var interactions = [
    {interaction: 'foo', twitter: 'bar'},
    {interaction: 'lorem', twitter: 'ipsum'},
    {interaction: 'dolor', other: 'amet'}
];
var data = {
    jsonMeta: JSON.stringify({id: 123, interactions: interactions}),
    jsonArray: JSON.stringify({interactions: interactions}),
    jsonNewLine: interactions.map(JSON.stringify).join("\n"),
    check: '{}',
    invalid: 'foo bar'
};

// Export mocks
module.exports = {
    createServer: function(){ return new httpServer(); },
    data: data
};