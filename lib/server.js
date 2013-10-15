var events = require('events');
var util = require('util');
var http = require('http');
var zlib = require('zlib');
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
    var buffer = [];
    var size = 0;

    // Validate authentication
    if(!this.validateAuthentication(request, response)){ // sends proper response on fail
        return;
    }

    // Validate path
    if(!this.validatePath(request, response)){ // sends proper response on fail
        return;
    }

    // Handle errors
    request.on('error', this.handleError.bind(this));

    // Handle incoming data chunks
    request.on('data', function(chunk){
        if(request.connection.destroyed) return;

        // Validate data size
        size += chunk.length;
        if(!this.validateSize(request, response, size)){ // sends proper response on fail
            return;
        }

        // Assemble post data
        buffer.push(new Buffer(chunk));
    }.bind(this));

    // Handle finished request
    request.on('end', function(){
        if(request.connection.destroyed) return;
        var bufferData = Buffer.concat(buffer);
        if(request.headers['content-encoding'] === 'gzip'){
            zlib.inflate(bufferData, function(error, data){
                if(error){
                    this.respond(response, 400);
                    this.emit('refused', 'Could not inflate compressed data');
                }else{
                    this.handleRequestData(request, response, data.toString());
                }
            }.bind(this));
        }else{
            this.handleRequestData(request, response, bufferData.toString());
        }
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
 * Validate and handle request body
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @param {String} rawData
 */
Server.prototype.handleRequestData = function(request, response, rawData){

    // Respond to checks
    if(this.handleCheck(request, response, rawData)){
        return;
    }

    // Parse and validate data
    var data = this.parse(request, response, rawData); // sends proper response on fail
    if(!data) return;

    // Emit data and respond to request
    this.emitData(request, response, data);
};

/**
 * Respond to request
 *
 * @param {http.ServerResponse} response
 * @param {number} code HTTP status code (optional, default 200)
 * @param {String} data Response body (optional)
 */
Server.prototype.respond = function(response, code, data){
    if(!code) code = 200;
    response.writeHead(code, http.STATUS_CODES[code], { 'Content-Type': 'text/plain' });
    if(code === 200 && !data){
        response.end(JSON.stringify({success: true}));
    }else{
        response.end(data || http.STATUS_CODES[code]);
    }
};

/**
 * Handle HTTP authentication
 *
 * @param {http.IncomingMessage} request
 * @param {http.ServerResponse} response
 * @return {Boolean} true on success, false on fail
 */
Server.prototype.validateAuthentication = function(request, response){

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
Server.prototype.validatePath = function(request, response){
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
Server.prototype.validateSize = function(request, response, size){
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
        this.respond(response, 200);
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
            return rawData.trim().split("\n").map(JSON.parse);
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

    // Assemble meta data
    var meta = {
        url: request.url,
        url_parsed: url.parse(request.url, true),
        hash: request.headers['x-datasift-hash'],
        hash_type: request.headers['x-datasift-hash-type'],
        id: request.headers['x-datasift-id']
    };

    // Emit data and execute success callback
    if(this.confirmData){
        this.emit('data', data, meta, done);
    }else{
        this.emit('data', data, meta);
        done();
    }
};

module.exports = Server;
