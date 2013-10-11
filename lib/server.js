var events = require('events');
var util = require('util');
var http = require('http');
var url = require('url');

/**
 * Initialize class
 */
function Server(){
    events.EventEmitter.call(this);
    this.initialize.apply(this, arguments);
}
util.inherits(Server, events.EventEmitter);

/**
 * Class constants
 */
Server.DEFAULT_HOSTNAME = undefined;
Server.DEFAULT_PORT = 80;
Server.DEFAULT_PATH = '/';
Server.DEFAULT_FORMAT = 'json_meta'; // json_meta, json_array, json_new_line
Server.CONFIRM_DATA = false;
Server.MAX_SIZE = 20971520; // 20MB, DataSift max
Server.RESPOND_TIME = 10000; // 10sec, DataSift maximum respond time

/**
 * Constructor
 *
 * @param {Object} options Configuration options (optional)
 */
Server.prototype.initialize = function(options){

    // Apply options
    if(!options) options = {};
    this.options = options;
    this.hostname = options.hasOwnProperty('hostname')? options.hostname : Server.DEFAULT_HOSTNAME;
    this.port = options.port || Server.DEFAULT_PORT;
    this.path = options.path || Server.DEFAULT_PATH;
    this.format = options.format || Server.DEFAULT_FORMAT;
    this.confirmData = options.hasOwnProperty('confirmData')? options.confirmData : Server.CONFIRM_DATA;
    this.maxSize = options.maxSize || Server.MAX_SIZE;

    // Start server
    this.http = http.createServer(this.handleRequest.bind(this));
    this.http.on('error', this.handleError.bind(this));
    this.http.listen(this.port, this.hostname, function(){
        this.emit('initialized', this.port, this.hostname);
    }.bind(this));
};

/**
 * Handle incoming request
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 */
Server.prototype.handleRequest = function(request, response){
    var rawData = '';
    var size = 0;

    // Validate authentication
    if(!this.authenticate(request, response)){
        return;
    }

    // Validate path
    if(!this.validPath(request, response)){
        return;
    }

    // Handle errors
    request.on('error', this.handleError.bind(this));

    // Handle incoming data chunks
    request.on('data', function(chunk){
        if(request.connection.destroyed) return;

        // Validate data size
        size += chunk.length;
        if(!this.validSize(request, response, size)){
            return;
        }

        // Assemble post data
        rawData += chunk.toString();
    }.bind(this));

    // Handle finished request
    request.on('end', function(){
        if(request.connection.destroyed) return;

        // Respond to checks
        if(this.handleCheck(request, response, rawData)){
            return;
        }

        // Parse and validate data
        var data = this.parse(request, response, rawData);
        if(!data) return;

        // Emit data and respond to request
        this.emitData(request, response, data);
    }.bind(this));
};

/**
 * Emit internal errors
 *
 * @param {Error} e
 */
Server.prototype.handleError = function(e){
    this.emit('error', e);
};

/**
 * Respond to request
 *
 * @param {http.ServerResponse} response
 * @param {number} code HTTP status code (optional, default 200)
 * @param {String} data Response body (optional)
 */
Server.prototype.respond = function(response, code, data){
    response.writeHead(code, http.STATUS_CODES[code], { 'Content-Type': 'text/plain' });
    response.end(data || http.STATUS_CODES[code]);
};

/**
 * Handle HTTP authentication
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @return {Boolean} true on success, false on fail
 */
Server.prototype.authenticate = function(request, response){

    // Ok when no authorization required
    if(!(this.options.username && this.options.password)) return true;

    // Validate authorization headers
    var header = request.headers.authorization || '';
    var encrypted = header.split(' ').pop() || '';
    var credentials = new Buffer(encrypted, 'base64').toString().split(':');
    if(credentials[0] === this.options.username && credentials[1] === this.options.password) return true;

    // Respond with 401:unauthorized
    this.respond(response, 401);
    this.emit('refused', 'Request did not contain required authentication headers');
    return false;
};

/**
 * Validate requested path
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @return {Boolean} true on success, false on fail
 */
Server.prototype.validPath = function(request, response){
    var path = url.parse(request.url, true).pathname;
    if(path.indexOf(this.path) === 0){
        return true;
    }else{
        this.respond(response, 404);
        this.emit('refused', 'Requested path "' + path + '" does not match "' + this.path + '"');
        return false;
    }
};

/**
 * Validate size of post data
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {number} size
 * @return {Boolean} true on success, false on fail
 */
Server.prototype.validSize = function(request, response, size){
    if(size <= this.maxSize){
        return true;
    }else{
        this.respond(response, 413);
        request.connection.destroy();
        this.emit('refused', 'Post data exceeded limit of ' + this.maxSize + ' bytes');
        return false;
    }
};

/**
 * Handle endpoint checks (post body is "{}")
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {String} rawData
 * @return {Boolean} true when request was a check, false otherwise
 */
Server.prototype.handleCheck = function(request, response, rawData){
    if(rawData === '{}'){
        this.respond(response, 200, JSON.stringify({success: true}));
        this.emit('check');
        return true;
    }else{
        return false;
    }
};

/**
 * Parse post data
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {String} rawData
 * @return {Array} List of interactions
 */
Server.prototype.parse = function(request, response, rawData){
    try{
        if(this.format === 'json_meta' || this.format === 'json_array'){
            return JSON.parse(rawData).interactions;
        }else{
            return rawData.trim().split("\n").map(function(rawInteraction){
                return JSON.parse(rawInteraction);
            });
        }
    }catch(e){
        this.respond(response, 400);
        this.emit('refused', 'Could not parse post data');
        return undefined;
    }
};

/**
 * Emit parsed data
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {Array} data List of interactions
 */
Server.prototype.emitData = function(request, response, data){

    // Callback for successful handles
    var doneTimeout;
    var done = function(success){
        clearTimeout(doneTimeout);
        this.respond(response, success === false? 500 : 200);
    }.bind(this);

    // Run callback if no response within proper time
    doneTimeout = setTimeout(function(){
        this.emit('error', new Error('Callback for data event not called within allowed time'));
        done(false);
    }.bind(this), Server.RESPOND_TIME);

    // Emit data and execute success callback
    if(this.confirmData){
        this.emit('data', data, done);
    }else{
        this.emit('data', data);
        done();
    }
};

module.exports = Server;
