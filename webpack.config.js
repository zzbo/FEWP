var path = require('path');
var fs = require('fs');
var project = require('./project.json');
var base = project.directory.base;
var staticDev = project.directory.static.dev;
var staticDevDir = path.resolve(base, staticDev);
var staticDevSrc = path.resolve(staticDevDir, 'src');
var staticCompile = project.directory.static.compile;
var staticCompileDir = path.resolve(base, staticCompile);
var staticDebugDir = path.resolve(staticDevDir, 'debug');
var ExtractTextPlugin = require('extract-text-webpack-plugin');
var channel = project.channel || '';

//获取开发分支的入口文件
function getEntries () {
    var devSrcJsDir = path.resolve(staticDevSrc, 'js', channel);
    console.log(devSrcJsDir);
    var entryFiles = fs.readdirSync(devSrcJsDir);
    var rtn = {};

    entryFiles.map(function (file) {
        var extname = path.extname(file);
        var filename = '';

        if (extname === '.js') {
            filename = file.replace(extname, '');
            rtn[filename] = path.resolve(devSrcJsDir, file);
        }
    });

    return rtn;
}

module.exports = {
    entry: getEntries(),
    output: {
        path: staticDebugDir,
        filename: 'js/' + channel + '/[name].js',
        chunkFilename: 'js/' + channel + '/[name].chunk[id].js',
        publicPath : 'http://static.test.com/'
    },
    resolveLoader: {
        root: path.join(__dirname, 'node_modules')
    },
    module: {
        loaders: [{
            test: /\.css$/,
            loader: ExtractTextPlugin.extract('style-loader', 'css-loader!autoprefixer-loader?{browsers:["> 0.1%"]}')
        }, {
            test: /\.scss$/,
            loader: ExtractTextPlugin.extract('style-loader', 'css-loader!sass-loader!autoprefixer-loader?{browsers:["> 0.1%"]}')
        }, {
            test: /.*\.(gif|png|jpe?g|svg)$/i,
            loaders: [
              'file?name=img/[name].[ext]',
              'image-webpack?{progressive:true, optimizationLevel: 7, interlaced: false, pngquant:{quality: "65-80", speed: 4}}'
            ]
        }, {
            test: /\.ejs$/,
            loader: 'ejs-loader?variable=data'
        }]
    },
    plugins : [
        new ExtractTextPlugin('css/' + channel + '/[name].css') //分离出css内容为单独文件
    ]
};
