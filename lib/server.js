var fs = require('fs');
var url = require('url');
var path = require('path');
var koa = require('koa');
var httpProxy = require('http-proxy'); 
var request = require('koa-request');
var project = require('../project.json');
var Freemarker = require('freemarker.js');
var io = require('socket.io');
var channel = project.channel || '';
var basePath = '../' + project.directory.base;
var relDevStaticPath = project.directory.static.dev;
var relDevTplPath = channel ? project.directory.tpls[channel] : project.directory.tpls;
var debugStaticPath = path.resolve(basePath, relDevStaticPath, 'debug');
var tplDirPath = path.resolve(basePath, relDevTplPath);
var mockBase = '../mock/';
var mockConfig = require(mockBase + 'mock.config.js');
var mockDataPath = mockBase + 'mockData';

var PORT = 80;
var MIME = {
    'css': 'text/css',
    'js': 'text/javascript',
    'gif': 'image/gif',
    'ico': 'image/x-icon',
    'jpeg': 'image/jpeg',
    'jpg': 'image/jpeg',
    'png': 'image/png',
    'swf': 'application/x-shockwave-flash',
    'svg': "image/svg+xml",
    'ttf': "application/x-font-ttf",
    'otf': "application/x-font-opentype",
    'woff': "application/font-woff",
    'eot': "application/vnd.ms-fontobject",
    'html': "text/html"
};

// freemarker instance
var fm = new Freemarker({
    viewRoot: tplDirPath
});

var app = koa();
app.use(function *(next){
    var self = this;
    var req = this.request;
    var host = req.header.host;
    var parseUrl = url.parse(req.url);
    var _path = parseUrl.path;
    var pathname = parseUrl.pathname;
    var extname = path.extname(pathname);
    var fullUrl = !!~req.url.indexOf(host) ? req.url : (host + _path);
    var port = parseUrl.port;
    var ext = path.extname(pathname);
    var ext = ext ? ext.slice(1) : 'unknown';   
    var contentType = MIME[ext] || 'text/plain';

    if (!port || port === 80) {
        mockConfig.mock.every(function (mockObj, i) {
            var reg = new RegExp(mockObj.url);
            var matchResult = fullUrl.match(reg);
            
            if (matchResult) {
                switch (mockObj.type) {
                    case 'static':
                        self.mode = 'static';
                        self.filePath = mockObj.filePath;
                        self.type = contentType;
                        
                        if (matchResult.length > 1
                            && /\$\d/g.test(mockObj.filePath)) {
                            self.filePath = mockObj.filePath
                                .replace(/\$(\d)/g, function (a, b) {
                                    return matchResult[b];
                                });
                        }
                        break;
                    case 'page':
                        self.mode = 'freemarker';
                        self.filePath = mockObj.filePath;
                        self.mockDataPath = path.join(mockDataPath, mockObj.mockDataPath);
                        break;
                    case 'api':
                        var match = parseUrl.path.match(/\?callback=([^\&]+)\&?/);
                        self.mode = 'api';
                        self.jsonpCbName = match ? match[1] : '';
                        self.mockDataPath = path.join(mockDataPath, mockObj.mockDataPath);
                        break;
                    default:
                        break;
                }
                return false;
            }
            else {
                self.mode = 'notMatch';
                return true;
            }
        });
    }
    else {
        this.mode = 'other';
        this.reqUrl = req.url;
    }

    yield next;
});

//check file exists and read the content of file
app.use(function *() {
    switch (this.mode) {
        case 'static':
            var isExist = fs.existsSync(this.filePath);
            this.body = isExist ? fs.readFileSync(this.filePath) : '';
            this.status = isExist ? 200 : 404;
            this.set('Access-Control-Allow-Origin', '*');
            break;
        case 'freemarker':
            var absFilePath = path.join(tplDirPath, this.filePath);
            var mockData = require(this.mockDataPath);
            var isExist = fs.existsSync(absFilePath);
            var browserSyncScript = '<script type="text/javascript" id="__bs_script__">document.write(\'<script async src=\"http://HOST:3000/browser-sync/browser-sync-client.2.9.11.js\"><\\/script>\'.replace("HOST", location.hostname));<\/script>';
            
            if (isExist) {
                var fileContent = fs.readFileSync(absFilePath).toString();
                var newFileContent = fileContent.replace(/\${getVerAssetFile\("([^"]+)"\)}/g, '//static.xxx.com/$1');
                fs.writeFileSync(absFilePath, newFileContent);
                this.body = fm.renderSync(this.filePath, mockData);
                fs.writeFileSync(absFilePath, fileContent);

                //inject browser-sync script
                this.body = this.body.replace('</body>', browserSyncScript +'</body>');
            }
            else {
                this.body = '//Template not found';
            }
            break;
        case 'api':
            var mockData = require(this.mockDataPath);
            if (this.jsonpCbName) {
                this.body = [this.jsonpCbName, '(', JSON.stringify(mockData), ')'].join('');
            }
            else {
                this.body = JSON.stringify(mockData);
            }
            break;
        case 'other':
            var response = yield request({url : this.reqUrl});
            this.body = response.body;
            break;
        default:
            this.body = '//Not match any pattern.';
            break;
    }
});

app.listen(PORT);
console.log('Server listen at port', PORT);

