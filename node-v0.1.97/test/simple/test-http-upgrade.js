require("../common");

var sys = require("sys");
var net = require("net");
var http = require("http");


var requests_recv = 0;
var requests_sent = 0;
var request_upgradeHead = null;

function createTestServer(){
  return new testServer();
};

function testServer(){
  var server = this;
  http.Server.call(server, function(){});

  server.addListener("connection", function(){
    requests_recv++;
  });

  server.addListener("request", function(req, res){
    res.writeHead(200, {"Content-Type": "text/plain"});
    res.write("okay");
    res.end();
  });

  server.addListener("upgrade", function(req, socket, upgradeHead){
    socket.write( "HTTP/1.1 101 Web Socket Protocol Handshake\r\n"
                + "Upgrade: WebSocket\r\n"
                + "Connection: Upgrade\r\n"
                + "\r\n\r\n"
                );

    request_upgradeHead = upgradeHead;

    socket.ondata = function(d, start, end){
      var data = d.toString('utf8', start, end);
      if(data == "kill"){
        socket.end();
      } else {
        socket.write(data, "utf8");
      }
    };
  });
};

sys.inherits(testServer, http.Server);


function testClient(){
  var conn = net.createConnection(PORT);
  conn.setEncoding("utf8");
  return conn;
}

function writeReq(socket, data, encoding){
  requests_sent++;
  socket.write(data);
};


/*-----------------------------------------------
  connection: Upgrade with listener
-----------------------------------------------*/
function test_upgrade_with_listener(_server){
  var conn = new testClient();
  var state = 0;

  conn.addListener("connect", function () {
    writeReq( conn
            , "GET / HTTP/1.1\r\n"
            + "Upgrade: WebSocket\r\n"
            + "Connection: Upgrade\r\n"
            + "\r\n"
            + "WjN}|M(6"
            );
  });

  conn.addListener("data", function(data){
    state++;

    if(state == 1){
      assert.equal("HTTP/1.1 101", data.substr(0, 12));
      assert.equal("WjN}|M(6", request_upgradeHead.toString("utf8"));
      conn.write("test", "utf8");
    } else if(state == 2) {
      assert.equal("test", data);
      conn.write("kill", "utf8");
    }
  });

  conn.addListener("end", function(){
    assert.equal(2, state);
    conn.end();
    _server.removeAllListeners("upgrade");
    test_upgrade_no_listener();
  });
};

/*-----------------------------------------------
  connection: Upgrade, no listener
-----------------------------------------------*/
var test_upgrade_no_listener_ended = false;

function test_upgrade_no_listener(){
  var conn = new testClient();

  conn.addListener("connect", function () {
    writeReq(conn, "GET / HTTP/1.1\r\nUpgrade: WebSocket\r\nConnection: Upgrade\r\n\r\n");
  });

  conn.addListener("end", function(){
    test_upgrade_no_listener_ended = true;
    conn.end();
  });

  conn.addListener("close", function(){
    test_standard_http();
  });
};

/*-----------------------------------------------
  connection: normal
-----------------------------------------------*/
function test_standard_http(){
  var conn = new testClient();
  conn.addListener("connect", function () {
    writeReq(conn, "GET / HTTP/1.1\r\n\r\n");
  });

  conn.addListener("data", function(data){
    assert.equal("HTTP/1.1 200", data.substr(0, 12));
    conn.end();
  });

  conn.addListener("close", function(){
    server.close();
  });
};


var server = createTestServer();
server.addListener("listening", function(){
  // All tests get chained after this:
  test_upgrade_with_listener(server);
});

server.listen(PORT);


/*-----------------------------------------------
  Fin.
-----------------------------------------------*/
process.addListener("exit", function () {
  assert.equal(3, requests_recv);
  assert.equal(3, requests_sent);
  assert.ok(test_upgrade_no_listener_ended);
});
