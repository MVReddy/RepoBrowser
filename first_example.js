var http = require('http');
var dt = require('./first_module');
var url = require('url');

http.createServer(function (req, res) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    res.write("The date and time are currently: " + dt.myDateTime());
	//res.write(req.url);
	
	var q = url.parse(req.url, true).query;
	var txt = q.year + " " + q.month;
	res.write(txt)
    res.end();
}).listen(8080);