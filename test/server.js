var http = require('http');
var expect = require('expect.js');
var sinon = require('sinon');
var httpMocks = require('node-mocks-http');
var mocks = require('./mocks');
var Server = require('../lib/server');

describe('Server', function(){

    var spy, s, request, response, _RESPOND_TIME;
    beforeEach(function(){
        spy = sinon.spy();
        s = new Server();
        request = httpMocks.createRequest();
        response = httpMocks.createResponse();
        _RESPOND_TIME = Server.RESPOND_TIME;
    });

    afterEach(function(){
        Server.RESPOND_TIME = _RESPOND_TIME;
    });

    before(function(){
        sinon.stub(http, 'createServer', mocks.createServer);
    });

    after(function(){
        http.createServer.restore();
    });

    describe('Constants', function(){
        it('should have a default hostname', function(){
            expect(Server.DEFAULT_HOSTNAME).to.be(undefined);
        });

        it('should have a default port', function(){
            expect(Server.DEFAULT_PORT).to.be(80);
        });

        it('should have a default path', function(){
            expect(Server.DEFAULT_PATH).to.be('/');
        });

        it('should have a default format', function(){
            expect(Server.DEFAULT_FORMAT).to.be('json_meta');
        });

        it('should have a default confirm_date', function(){
            expect(Server.CONFIRM_DATA).to.be(false);
        });

        it('should have a default max_size', function(){
            expect(Server.MAX_SIZE).to.be(20971520);
        });

        it('should have a default respond_time', function(){
            expect(Server.RESPOND_TIME).to.be(10000);
        });
    });

    describe('Constructor', function(){
        it('should set default options', function(){
            var s = new Server();
            expect(s.hostname).to.be(Server.DEFAULT_HOSTNAME);
            expect(s.port).to.be(Server.DEFAULT_PORT);
            expect(s.path).to.be(Server.DEFAULT_PATH);
            expect(s.format).to.be(Server.DEFAULT_FORMAT);
            expect(s.confirmData).to.be(Server.CONFIRM_DATA);
            expect(s.maxSize).to.be(Server.MAX_SIZE);
        });

        it('should keep track of config options', function(){
            var options = {foo: 'bar'};
            var s = new Server(options);
            expect(s.options).to.eql(options);
        });
    });

    describe('Ready state', function(){
        it('should emit initialized event', function(done){
            var s = new Server({ port: 1234, hostname: 'example.com' });
            s.on('initialized', function(){
                spy.apply(spy, arguments);
                expect(spy.args[0][0]).to.be(1234);
                expect(spy.args[0][1]).to.be('example.com');
                done();
            });
        });
    });

    describe('#handleError', function(){
        it('should emit error', function(){
            var error = new Error('Lorem ipsum');
            s.on('error', spy);
            s.handleError(error);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.be(error);
        });
    });

    describe('#handleRequestData', function(){
        it('should emit data event on valid request', function(){
            var rawData = mocks.data.jsonMeta;
            s.on('data', spy);
            s.handleRequestData(request, response, rawData);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.be.an('array');
            expect(spy.args[0][0].length).to.be(3);
        });

        it('should not emit data event on invalid request', function(){
            var rawData = mocks.data.invalid;
            s.on('data', spy);
            s.handleRequestData(request, response, rawData);
            expect(spy.callCount).to.be(0);
        });

        it('should not emit data event on check request', function(){
            var rawData = mocks.data.check;
            s.on('data', spy);
            s.handleRequestData(request, response, rawData);
            expect(spy.callCount).to.be(0);
        });
    });

    describe('#respond', function(){
        it('should respond with default values', function(){
            s.respond(response);
            expect(response.statusCode).to.be(200);
            expect(response.getHeader('Content-Type')).to.be('text/plain');
            expect(response._getData()).to.be(JSON.stringify({success: true}));
        });

        it('should respond with custom code', function(){
            s.respond(response, 404);
            expect(response.statusCode).to.be(404);
            expect(response.getHeader('Content-Type')).to.be('text/plain');
            expect(response._getData()).to.be('Not Found');
        });

        it('should respond with custom data', function(){
            s.respond(response, undefined, 'lorem');
            expect(response.statusCode).to.be(200);
            expect(response.getHeader('Content-Type')).to.be('text/plain');
            expect(response._getData()).to.be('lorem');
        });

        it('should respond with custom code and data', function(){
            s.respond(response, 404, 'lorem');
            expect(response.statusCode).to.be(404);
            expect(response.getHeader('Content-Type')).to.be('text/plain');
            expect(response._getData()).to.be('lorem');
        });
    });

    describe('#validateAuthentication', function(){
        it('should emit refused event on missing credentials', function(){
            var s = new Server({username: 'lorem', password: 'ipsum'});
            s.on('refused', spy);
            var result = s.validateAuthentication(request, response);
            expect(response.statusCode).to.be(401);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.be('Request did not contain required authentication headers');
            expect(result).to.be(false);
        });

        it('should not emit refused event on optional credentials', function(){
            s.on('refused', spy);
            var result = s.validateAuthentication(request, response);
            expect(spy.callCount).to.be(0);
            expect(result).to.be(true);
        });

        it('should not emit refused event on correct credentials', function(){
            var s = new Server({username: 'lorem', password: 'ipsum'});
            request._setHeadersVariable('authorization', 'Basic ' + new Buffer('lorem:ipsum').toString('base64'));
            s.on('refused', spy);
            var result = s.validateAuthentication(request, response);
            expect(spy.callCount).to.be(0);
            expect(result).to.be(true);
        });
    });

    describe('#validatePath', function(){
        it('should emit refused event on invalid path', function(){
            var s = new Server({path: '/lorem/ipsum'});
            request._setURL('/foo/bar');
            s.on('refused', spy);
            var result = s.validatePath(request, response);
            expect(response.statusCode).to.be(404);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.be('Requested path "/foo/bar" does not match "/lorem/ipsum"');
            expect(result).to.be(false);
        });

        it('should not emit refused event on valid path', function(){
            s.on('refused', spy);
            request._setURL('/');
            var result = s.validatePath(request, response);
            expect(spy.callCount).to.be(0);
            expect(result).to.be(true);
        });
    });

    describe('#validateSize', function(){
        it('should emit refused event on invalid size', function(){
            request.connection = {destroy: function(){}}; // mock connection
            var s = new Server({maxSize: 500});
            s.on('refused', spy);
            var result = s.validateSize(request, response, 501);
            expect(response.statusCode).to.be(413);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.be('Post data exceeded limit of 500 bytes');
            expect(result).to.be(false);
        });

        it('should not emit refused event on valid size', function(){
            s.on('refused', spy);
            var result = s.validateSize(request, response, 500);
            expect(spy.callCount).to.be(0);
            expect(result).to.be(true);
        });
    });

    describe('#handleCheck', function(){
        it('should emit check event on valid data', function(){
            s.on('check', spy);
            var result = s.handleCheck(request, response, mocks.data.check);
            expect(response.statusCode).to.be(200);
            expect(spy.callCount).to.be(1);
            expect(result).to.be(true);
        });

        it('should not emit check event on invalid data', function(){
            s.on('check', spy);
            var result = s.handleCheck(request, response, mocks.data.invalid);
            expect(spy.callCount).to.be(0);
            expect(result).to.be(false);
        });
    });

    describe('#parse', function(){
        it('should emit refused event on invalid data', function(){
            s.on('refused', spy);
            var result = s.parse(request, response, mocks.data.invalid);
            expect(response.statusCode).to.be(400);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.be('Could not parse post data');
            expect(result).to.be(undefined);
        });

        it('should not emit refused event on valid data', function(){
            s.on('refused', spy);
            var result = s.handleCheck(request, response, mocks.data.jsonMeta);
            expect(spy.callCount).to.be(0);
            expect(result).not.to.be(undefined);
        });

        it('should return parsed data with format json_meta', function(){
            s = new Server({format: 'json_meta'});
            var interactions = JSON.parse(mocks.data.jsonMeta).interactions;
            var result = s.parse(request, response, mocks.data.jsonMeta);
            expect(result).to.eql(interactions);
        });

        it('should return parsed data with format json_array', function(){
            s = new Server({format: 'json_array'});
            var interactions = JSON.parse(mocks.data.jsonArray).interactions;
            var result = s.parse(request, response, mocks.data.jsonArray);
            expect(result).to.eql(interactions);
        });

        it('should return parsed data with format json_new_line', function(){
            s = new Server({format: 'json_new_line'});
            var interactions = mocks.data.jsonNewLine.split("\n").map(JSON.parse);
            var result = s.parse(request, response, mocks.data.jsonNewLine);
            expect(result).to.eql(interactions);
        });

        it('should return undefined with mismatching format', function(){
            var result = s.parse(request, response, mocks.data.jsonNewLine);
            expect(result).to.eql(undefined);
        });
    });

    describe('#emitData', function(){
        var data = [];
        it('should emit data event with data and meta', function(){
            s.on('data', spy);
            s.emitData(request, response, data);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.eql(data);
            expect(spy.args[0][1]).to.be.an('object'); // meta
            expect(spy.args[0][2]).to.be(undefined);
        });

        it('should emit data event with data, meta and done', function(){
            var s = new Server({ confirmData: true });
            s.on('data', spy);
            s.emitData(request, response, data);
            expect(spy.callCount).to.be(1);
            expect(spy.args[0][0]).to.eql(data);
            expect(spy.args[0][1]).to.be.an('object'); // meta
            expect(spy.args[0][2]).to.be.an('function');
        });

        it('should respond with success on default confirmData', function(){
            s.emitData(request, response, data);
            expect(response.statusCode).to.be(200);
        });

        it('should not respond when confirmData is true', function(){
            var s = new Server({ confirmData: true });
            s.emitData(request, response, data);
            expect(response.statusCode).to.be(-1);
        });

        it('should respond after a while with HTTP 500 when confirmData is true', function(done){
            Server.RESPOND_TIME = 1;
            var errorSpy = sinon.spy();
            var s = new Server({ confirmData: true });
            var response = httpMocks.createResponse();
            s.on('error', errorSpy);
            s.emitData(request, response, data);
            setTimeout(function(){
                expect(response.statusCode).to.be(500);
                expect(errorSpy.callCount).to.be(1);
                expect(errorSpy.args[0][0].message).to.be('Callback for data event not called within allowed time');
                done();
            }, 1);
        });
    });
});