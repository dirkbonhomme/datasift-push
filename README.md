# DataSift Push Server for HTTP

This library is a Node.js implementation for DataSift's HTTP connector as described in their [HTTP docs](http://dev.datasift.com/docs/push/connectors/http). It should be used as a public endpoint for Push delivery.

## Usage overview

The following topics are covered:

* Installation
* Configuration
* Events
* FAQ
* Development & testing

## Installation

This library is not a stand-alone server but should be used as a dependency in an app that is able to handle incoming data.

Add `datasift-push` to your package.json dependencies and run the following command:

    $ npm install
    
Include it in your app:

    var DataSift = require('datasift-push');
    var server = new DataSift({ port: 8080 });
    server.on('data', datahandler);
    
## Configuration

#### `hostname` (String, optional)

Limit incoming requests to a certain hostname.

#### `sslKey` and `sslCert` (String or Buffer, optional)

Provide both your SSL private key and certificate to start an https server.

#### `port` (Number, optional)

Listen for incoming requests on a certain port. Defaults to 80.

#### `path` (String, optional)

Limit incoming requests to a certain path. Defaults to "/".  
A path of "/lorem/ipsum" will allow all requests to "/lorem/ipsum" and "/lorem/ipsum/dolor" but not "/lorem/sit/amet"

#### `format` (String, optional)

Format of incoming data. One of `json_meta`, `json_array` or `json_new_line`. Defaults to json_meta.  
Make sure that push subscriptions are created with the same format. The server will refuse all requests that cannot be parsed.

#### `maxSize` (Number, optional)

Maximum allowed size of request body (in bytes). Defaults to 20971520 (20MB, DataSift max)  
The server will immediately close the connection as soon as the size has been exceeded.

#### `confirmData` (Boolean, optional)

Expect app to confirm all emitted data. Defaults to false.  
When set to true, the server expects your app to confirm that it has processed incoming data. The `data` event will have a third parameter with a "done" callback. Call this to confirm that the incoming data has been saved. If your app does not respond within 10 seconds, the server will automatically respond with a HTTP 500 message. As a result, DataSift will try to resend the data after a certain interval.

#### `username` and `password` (String, optional)

Requires incoming requests to be authorized. Defaults to undefined.

### Example

    var server = new DataSift({
        port: 8080,
        path: '/lorem/ipsum/',
        username: 'john',
        password: 'loremipsum'
    });

## Events

#### `initialized`

Emitted when server starts listening on the provided port. Arguments: `port`, `hostname`

#### `refused`

Emitted when an incoming request has been refused. Arguments: `reason`

- Could not inflate compressed data
- Request did not contain required authentication headers
- Requested path "..." does not match "..."
- Post data exceeded limit of ... bytes
- Could not parse post data

#### `error` 

Emitted on internal errors. Arguments: `error` (Error instance)

#### `check`

Emitted after handling a "check" request from DataSift. Arguments: none

#### `data`

Emitted after parsing incoming data. Arguments: `data`, `meta`, `done` (optional)

- data: array of interactions and deletions
- meta: object with the request's meta data
    - url (raw url)
    - url_parsed (parsed url)
    - hash (playback id or stream hash)
    - hash_type (either historic or stream)
    - id (subscription id)
- done: function to be called after processing incoming data. Only provided when option `confirmData` is true. Call as `done(false)` to respond with a HTTP 500.

## FAQ

Q: I do not receive any incoming data  
A: Make sure the path, hostname and port are configured correctly and that your server is accessible from the internet.

Q: I keep receiving the same data  
A: Did you enable the `confirmData` option? Make sure you call the `done` function after processing incoming data. Make sure you are able to process incoming data in time.

Q: I am unable to see what's going on  
A: Listen to all described events to find out if there are any errors or refused connections. You might want to use `server.http` for more details debugging.


## Developing

The library is published to NPM and can be installed with the following command:

    $ npm install datasift-push

## Testing

Navigate to this module's repository and make sure you have the development modules installed:

    $ npm install


Run the tests:

    $ npm test

