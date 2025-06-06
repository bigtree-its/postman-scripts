var express = require('express');
var fs = require('fs');
var bodyParser = require('body-parser');

var app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json()); // Body parser use JSON data
app.post('/endpoints', function(req, res) {
    var outputFilename = './endpoints.txt'; // path of the file to output
    fs.appendFileSync(outputFilename, req.body.payload, null, 4);
    // write to the file system
    res.send('Saved to endpoints' + outputFilename);
});
app.post('/launches', function(req, res) {
    var outputFilename = './spaceReport.json'; // path of the file to output
    fs.writeFileSync(outputFilename, JSON.stringify(JSON.parse(req.body.payload), null, 4)); // write to the file system
    res.send('Saved to ' + outputFilename);
});

app.get('/welcome', function(req, res) {
    res.send('Hello Welcome');
});

var port = 3000;
app.listen(port);
console.log('Express started on port %d ...', port);