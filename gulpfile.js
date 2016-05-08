var fs = require('fs');
var path = require('path');
var gulp = require('gulp');
var gutil = require('gulp-util');
var uglify = require('gulp-uglify');
var spritesmith = require('gulp.spritesmith');
var mergeStream = require('merge-stream');
var webpack = require('webpack');
var webpackConfig = require('./webpack.config.js');
var cp = require('child_process');
var project = require('./project.json');
var config = require('./config.json');
var browserSync = require('browser-sync').create();
var argv = require('optimist').argv;

var rename = require('gulp-rename');
var sass = require('gulp-sass');
var minifycss = require('gulp-minify-css');
var cssbeautify = require('gulp-cssbeautify');
var imagemin = require('gulp-imagemin');
var pngquant = require('imagemin-pngquant');
var autoprefixer = require('gulp-autoprefixer');
var changed = require('gulp-changed');
var rev = require('gulp-rev');
var importCss = require('gulp-import-css');
var revCollector = require('gulp-rev-collector');
var runSequence = require('gulp-run-sequence');
var mergeJSON = require('gulp-extend');
var Stream = require("stream");
var inlinesource = require('gulp-inline-source');
var contentInclude = require('gulp-content-includer');
var replace = require('gulp-replace');

var base = project.directory.base;
var staticDev = project.directory.static.dev;
var staticTpl = project.directory.tpls;
var staticDevDir = path.resolve(base, staticDev);
var staticTplDir = path.resolve(base, staticTpl);
var staticDevSrc = path.resolve(staticDevDir, 'src');
var staticCompile = project.directory.static.compile;
var staticCompileDir = path.resolve(base, staticCompile);
var channel = project.channel ? (project.channel +'/') : '';

var paths = {
    component : staticDevSrc + '/component/',
    js : staticDevSrc + '/js/'+channel,
    css : staticDevSrc + '/css/'+channel,
    img : staticDevSrc + '/img/'+channel,
    html : staticDevSrc + '/html/'+channel,
    sprite : staticDevSrc + '/img/'+channel+'sprite/',
    debugcon : staticDevDir + '/debug/component/',
    debugJs : staticDevDir + '/debug/js/'+channel,
    debugCss : staticDevDir + '/debug/css/'+channel,
    debugImg : staticDevDir + '/debug/img/'+channel,
    debugHtml : staticDevDir + '/debug/html/'+channel
}

var gulpCallback = function (cb) {
    var stream = new Stream.Transform({objectMode: true});

    stream._transform = function(file, unused, callback) {
        cb && cb();
        callback(null, file);
    }
    return stream;
}

// ==================== component ====================
gulp.task('component', function (done) {
    var destPath = paths.debugcon;
    return gulp.src(paths.component + '**/*')
        .pipe(gulp.dest(destPath));
});

// ==================== webpack ====================
gulp.task('script', function (done) {
    return webpack(webpackConfig, function (err, stats) {
            if(err) throw new gutil.PluginError('webpack', err);
            gutil.log('[webpack]', stats.toString({
                colors: true
            }));
            done();
        });
});

// ==================== css ====================
gulp.task('css', function () {
    var destPath = paths.debugCss;

    gulp.src([paths.css + 'common/font/**/*',
        paths.css + '_common/font/**/*'])
    .pipe(gulp.dest(destPath + 'font'))
    .pipe(browserSync.reload({stream: true}));

    return gulp.src([paths.css + '**/*.+(scss|css)', 
        '!' + paths.css + 'modules/**/*.+(scss|css)', 
        '!' + paths.css + 'common/**/*.+(scss|css)', 
        '!' + paths.css + 'sprite/**/*.+(scss|css)', 
        '!' + paths.css + '**/\_*.+(scss|css)',
        '!' + paths.css + '\_**/*.+(scss|css)'])
    .pipe(sass().on('error', sass.logError))
    .pipe(importCss())
    .pipe(changed(paths.css))
    .pipe(autoprefixer({
        browsers:['> 0.1%', 'last 2 versions']
    }))
    .pipe(cssbeautify({
        indent: '   ',
        openbrace: 'separate-line',
        autosemicolon: true
    }))
    .pipe(gulp.dest(destPath))
    .pipe(browserSync.reload({stream: true}));

});

// ==================== imagemin ====================
gulp.task('imagemin', function () {
    var destPath = paths.debugImg;
    
    gulp.src([paths.img + '**/*.gif',
    '!' + paths.img + 'sprite/**/*.+(png|jpg|gif)',
    '!' + paths.img + '\_**/*.+(png|jpg|gif)'])
    .pipe(gulp.dest(destPath));

    return gulp.src([paths.img + '**/*.+(png|jpg)',
        '!' + paths.img + 'sprite/**/*.+(png|jpg|gif)',
        '!' + paths.img + '\_**/*.+(png|jpg|gif)'])
            .pipe(imagemin({
                // progressive: true,
                svgoPlugins: [{removeViewBox: false}],
                // optimizationLevel: 4
                use: [pngquant({quality: '65-80', speed: 4})]
            }))
            .pipe(gulp.dest(destPath));
});

// ==================== sprite ====================
//convert a set of images into a spritesheet and CSS
gulp.task('sprite', function () {
    fs.readdirSync(paths.sprite).forEach(function (dirStr) {
        var fullPath = path.join(paths.sprite, dirStr);

        if (!fs.lstatSync(fullPath).isDirectory()) {return;}
        var imgDomain = config.imgDomain;
        var _imgName = 'sprite-' + dirStr + '.png';
        var _cssName = '_sprite-' + dirStr + '.scss';
        var _imgPath = imgDomain + '/img/sprite/' + channel + _imgName;
        var spriteData = gulp.src(fullPath + '**/*.+(png|jpg|gif)')
                .pipe(spritesmith({
                    imgName: _imgName,
                    cssName: _cssName,
                    imgPath: _imgPath
                }))

        //pipe to different directory
        var imgStream = spriteData.img.pipe(gulp.dest(paths.debugImg + 'sprite/'));
        var cssStream = spriteData.css.pipe(gulp.dest(paths.css + 'sprite/'));

        return mergeStream(imgStream, cssStream)
            .on('error',function(err){
                gutil.log('sprite Error!', err.message);
            });
    });
});

// ==================== html ====================
gulp.task('htmlimport', function() {
    var destPath = paths.debugHtml;

    return gulp.src([paths.html + '**/*.html',
        '!' + paths.html + 'modules/**/*.html',
        '!' + paths.html + 'common/**/*.html'])
        .pipe(contentInclude({
            includerReg:/<!\-\-include\s+"([^"]+)"\-\->/g
        }))
        .pipe(gulp.dest(destPath));
});

// ==================== release set ====================
// ==================== copyImage ====================
gulp.task('copyImage', function () {
    var srcPath = path.resolve(paths.debugImg, '../');
    var destPath = path.resolve(staticCompileDir, './img');

    gulp.src(srcPath+ '/**/*.+(png|jpg|gif)')
        .pipe(rev())
        .pipe(gulp.dest(destPath))
        .pipe(rev.manifest({
            path : 'imgRev.json'
        }))
        .pipe(gulp.dest(staticCompileDir));
});

// ==================== copycomponent ====================
gulp.task('copycon', function (done) {
    var srcPath = path.resolve(paths.debugcon, '../');
    var destPath = path.resolve(staticCompileDir, 'component');
    return gulp.src(srcPath)
        .pipe(gulp.dest(destPath));
});

// ==================== minifycss ====================
gulp.task('minify', function () {
    var srcPath = path.resolve(paths.debugCss, '../');
    var destPath = path.resolve(staticCompileDir, 'css');
    var imgRev = path.resolve(staticCompileDir, './imgRev.json');

    return gulp.src([imgRev, srcPath + '/**/*.css'])
        .pipe(revCollector({replaceReved: true}))
        .pipe(minifycss())
        //压缩样式文件
        .pipe(rev())
        .pipe(gulp.dest(destPath))
        .pipe(rev.manifest({
            path : 'cssRev.json'
        }))
        .pipe(gulp.dest(staticCompileDir));
});

// ==================== mergeJSON ====================
gulp.task('mergeImgCssJSON', function () {
    var imgRev = path.resolve(staticCompileDir, './imgRev.json');
    var cssRev = path.resolve(staticCompileDir, './cssRev.json');

    return gulp.src([imgRev, cssRev])
                .pipe(mergeJSON('imgCssRev.json', false, 2))
                .pipe(gulp.dest(staticCompileDir));
});

// ==================== uglify ====================
gulp.task('uglify', function () {
    var srcPath = path.resolve(paths.debugJs, '../');
    var destPath = path.resolve(staticCompileDir, 'js');
    var imgCssRev = path.resolve(staticCompileDir, './imgCssRev.json');
    
    return gulp.src([imgCssRev, srcPath + '/**/*.js'])
        .pipe(revCollector({replaceReved: true}))
        .pipe(uglify({
            mangle : false
        }))
        .pipe(rev())
        .pipe(gulp.dest(destPath))
        .pipe(rev.manifest({
            path : 'jsRev.json'
        }))
        .pipe(gulp.dest(staticCompileDir));
});

gulp.task('mergeAllJSON', function () {
    var imgRev = path.resolve(staticCompileDir, './imgRev.json');
    var cssRev = path.resolve(staticCompileDir, './cssRev.json');
    var jsRev = path.resolve(staticCompileDir, './jsRev.json');
    var imgCssRev = path.resolve(staticCompileDir, './imgCssRev.json');
    // var replaceReg = ;
    return gulp.src([imgRev, cssRev, jsRev])
            .pipe(mergeJSON('hash.json', false, 2))
            .pipe(gulp.dest(staticCompileDir))
            // .pipe(replace(replaceReg,'$1/$3'))
            .pipe(gulpCallback(function () {
                try {
                    fs.unlinkSync(imgRev);
                    fs.unlinkSync(cssRev);
                    fs.unlinkSync(jsRev);
                    fs.unlinkSync(imgCssRev);
                } catch (e) {}
            }));
});

// ==================== html ====================
gulp.task('htmlinline', function() {
    var htmlPath = path.resolve(paths.debugHtml, '../');
    var destPath = staticCompileDir;
    var replaceReg = /(<.+?)(?:http:|https:)?\/\/([^\/]+\/)([^>]+inline\s?\/?>)/g;

    return gulp.src([htmlPath + '**/*.html'])
        .pipe(replace(replaceReg, '$1/$3'))
        .pipe(inlinesource())
        .pipe(gulp.dest(destPath));
});

// ==================== server ====================
gulp.task('server', function () {
    var sp = cp.spawn('node', ['--harmony', 'server.js'], {
        cwd : './lib/'
    });
    sp.stdout.on('data', function (data) {
        console.log(data.toString());
    });
    sp.stdout.on('error', function (data) {
        console.log(data.toString());
    });
    runSequence('sprite', 
                'component',
                'imagemin', 
                'css', 
                'script', 
                'htmlimport');
});

// ==================== release ====================
gulp.task('build', function () {
    runSequence('copycon',
                'copyImage', 
                'minify', 
                'mergeImgCssJSON', 
                'uglify',
                'mergeAllJSON',
                'htmlinline');
});

// ==================== browser-sync ====================
gulp.task('browser-sync', function() {
    browserSync.init({
        open : true
    });
});

gulp.task('browserReload', function () {
    // reload page when file compiled done.
    if (!argv.nolivereload) {
        browserSync.reload();
    }
});

gulp.task('sb', function () {
    runSequence('script', 'browserReload');
});

// css -> script -> browserReload
gulp.task('csb', function () {
    runSequence('css', 'script');
});

gulp.task('htmlb', function() {
    runSequence('htmlimport', 'browserReload');
})

gulp.task('conb',function () {
    runSequence('component', 'browserReload');
})

// ==================== watch ====================
gulp.task('default', ['server', 'browser-sync'], function() {
    var watchCon = paths.component;
    var watchJsPath = paths.js + '**/*.js';
    var watchCssPath = paths.css + '**/*.+(scss|css)';
    var watchSprite = paths.sprite + '**/*';
    var watchImg =  paths.img + '**/*+(png|jpg|gif)';
    var watchHtml = paths.html + '**/*.html';

    gulp.watch(watchCon,['conb']);
    gulp.watch([watchJsPath], ['sb']);
    gulp.watch([watchCssPath], ['csb']);
    gulp.watch(watchSprite, ['sprite']);
    gulp.watch([watchImg], ['imagemin']);
    gulp.watch(watchHtml, ['htmlb']);
});
